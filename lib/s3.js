const zlib = require('zlib')
const { promisify } = require('util')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const config = require('../config')

const gzip = promisify(zlib.gzip)

const s3 = new S3Client({
  region: config.AWS_REGION,
  credentials: {
    accessKeyId: config.AWS_KEY,
    secretAccessKey: config.AWS_SECRET
  }
})

// No ACL: access comes from the bucket policy.
module.exports.upload = async function (key, data, contentType = 'application/json') {
  await s3.send(new PutObjectCommand({
    Bucket: config.AWS_BUCKET,
    Key: key,
    ContentType: contentType,
    Body: await gzip(data),
    ContentEncoding: 'gzip',
    CacheControl: 'max-age=43200'
  }))
}
