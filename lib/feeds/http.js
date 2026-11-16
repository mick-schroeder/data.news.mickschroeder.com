const USER_AGENT = 'popular-news-sites (+https://github.com/mick-schroeder/popular-news-sites)'

const decodeXml = function (buffer) {
  const head = buffer.subarray(0, 200).toString('latin1')
  const encoding = head.match(/<\?xml[^>]*encoding=["']([^"']+)/i)?.[1] || 'utf-8'
  return new TextDecoder(encoding).decode(buffer)
}

const RETRY_DELAY = 2000

const request = async function (url) {
  let response
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15000)
    })
  } catch (err) {
    err.retry = true
    throw err
  }
  if (!response.ok) {
    const err = new Error(`${url} returned HTTP ${response.status}`)
    err.retry = response.status >= 500
    throw err
  }
  return response
}

// One retry for timeouts, network errors and 5xx.
const fetchResponse = async function (url, retryDelay) {
  try {
    return await request(url)
  } catch (err) {
    if (!err.retry) throw err
    await new Promise(resolve => setTimeout(resolve, retryDelay))
    return request(url)
  }
}

module.exports.fetchBody = async function (url, format, { retryDelay = RETRY_DELAY } = {}) {
  const response = await fetchResponse(url, retryDelay)

  if (format === 'json') {
    return response.json()
  }
  if (format === 'xml') {
    return decodeXml(Buffer.from(await response.arrayBuffer()))
  }
  return response.text()
}
