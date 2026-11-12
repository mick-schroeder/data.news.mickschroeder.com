const USER_AGENT = 'popular-news-sites (+https://github.com/mick-schroeder/popular-news-sites)'

const decodeXml = function (buffer) {
  const head = buffer.subarray(0, 200).toString('latin1')
  const encoding = head.match(/<\?xml[^>]*encoding=["']([^"']+)/i)?.[1] || 'utf-8'
  return new TextDecoder(encoding).decode(buffer)
}

module.exports.fetchBody = async function (url, format) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(15000)
  })

  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`)
  }

  if (format === 'json') {
    return response.json()
  }
  if (format === 'xml') {
    return decodeXml(Buffer.from(await response.arrayBuffer()))
  }
  return response.text()
}
