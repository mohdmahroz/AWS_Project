import https from 'https';

export const handler = async () => {
  const url = 'https://example.com';

  const startTime = Date.now();

  try {
    const result = await checkWebsite(url);

    const latencyMs = Date.now() - startTime;

    const response = {
      url,
      available: result.statusCode >= 200 && result.statusCode < 400,
      statusCode: result.statusCode,
      latencyMs,
    };

    console.log('Website health check:', response);

    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    const response = {
      url,
      available: false,
      statusCode: null,
      latencyMs,
      error: error instanceof Error ? error.message : 'Unknown error',
    };

    console.error('Website health check failed:', response);

    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  }
};

function checkWebsite(
  url: string
): Promise<{ statusCode: number }> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      response.on('data', () => {});

      response.on('end', () => {
        resolve({
          statusCode: response.statusCode ?? 0,
        });
      });
    });

    request.on('error', reject);

    request.setTimeout(10000, () => {
      request.destroy();
      reject(new Error('Request timed out'));
    });
  });
}