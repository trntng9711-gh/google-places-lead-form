exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, {
      ok: false,
      error: 'Method not allowed'
    });
  }

  const webhookUrl = process.env.N8N_WEBHOOK_URL;

  if (!webhookUrl) {
    return jsonResponse(500, {
      ok: false,
      error: 'Missing N8N_WEBHOOK_URL environment variable'
    });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || '{}');
  } catch (error) {
    return jsonResponse(400, {
      ok: false,
      error: 'Invalid JSON payload'
    });
  }

  const validationError = validatePayload(payload);

  if (validationError) {
    return jsonResponse(400, {
      ok: false,
      error: validationError
    });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();

    if (!response.ok) {
      return jsonResponse(response.status, {
        ok: false,
        error: 'n8n webhook failed',
        detail: responseText
      });
    }

    return jsonResponse(200, {
      ok: true,
      message: 'Campaign submitted'
    });
  } catch (error) {
    return jsonResponse(502, {
      ok: false,
      error: 'Cannot reach n8n webhook',
      detail: error.message
    });
  }
};

function validatePayload(payload) {
  if (!payload.campaign_name) {
    return 'campaign_name is required';
  }

  if (!payload.keyword) {
    return 'keyword is required';
  }

  if (!payload.location && !payload.province) {
    return 'location or province is required';
  }

  const maxResults = Number(payload.max_results || 20);

  if (!Number.isFinite(maxResults) || maxResults < 1 || maxResults > 20) {
    return 'max_results must be between 1 and 20';
  }

  return '';
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
