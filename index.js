var util = require('util')
var stream = require('stream')

var DEFAULT_SIZE = 8192

function reverseBits (samples) {
  var x = samples.i
  var y = samples.q
  var n = samples.length

  var j = 0
  for (var i = 1; i < n - 1; i++) {
    var n1 = n / 2
    while (j >= n1) {
      j -= n1
      n1 = Math.floor(n1 / 2)
    }
    j += n1

    if (i < j) {
      var t1 = x[i]
      x[i] = x[j]
      x[j] = t1
      t1 = y[i]
      y[i] = y[j]
      y[j] = t1
    }
  }

  return samples
}

function fft (samples) {
  var x = samples.i
  var y = samples.q
  var n = samples.length
  var m = Math.log2(n)

  var n1 = 0
  var n2 = 1
  for (var i = 0; i < m; i++) {
    n1 = n2
    n2 = n2 + n2
    var a = 0

    for (var j = 0; j < n1; j++) {
      var c = Math.cos(-2*Math.PI*a/n)
      var s = Math.sin(-2*Math.PI*a/n)
      a += 1 << (m - i - 1)

      for (var k = j; k < n; k = k + n2) {
        t1 = c * x[k + n1] - s * y[k + n1]
        t2 = s * x[k + n1] + c * y[k + n1]
        x[k + n1] = x[k] - t1
        y[k + n1] = y[k] - t2
        x[k] = x[k] + t1
        y[k] = y[k] + t2
      }
    }
  }
  return samples
}

function toMagnitudes (samples) {
  var n = samples.length
  var magnitudes = new Float32Array(n)
  for (var i = 0; i < samples.length; i++) {
    var re = Math.pow(samples.i[i] / n, 2)
    var im = Math.pow(samples.q[i] / n, 2)
    var index = i//(i + n / 2) % n
    magnitudes[index] = 10 * Math.log10(Math.sqrt(re + im))
  }
  return magnitudes
}

function FFTStream (opts) {
  if (!(this instanceof FFTStream)) return new FFTStream(opts)
  stream.Transform.call(this, {
    readableObjectMode: true,
    writableObjectMode: true
  })

  opts = opts || {}
  this.size = opts.size || DEFAULT_SIZE
  this.signed = !!opts.signed
  this.overflow = new Buffer(0)
}
util.inherits(FFTStream, stream.Transform)

FFTStream.prototype._transform = function (data, encoding, cb) {
  if (this.overflow.length) {
    data = Buffer.concat([ this.overflow, data ])
    this.overflow = new Buffer(0)
  }

  while (data.length) {
    if (data.length < this.size * 2) {
      this.overflow = Buffer.concat([ this.overflow, data ])
      return cb(null)
    }

    var slice = data.slice(0, this.size * 2)
    data = data.slice(this.size * 2)

    var iq = {
      i: new Float32Array(this.size),
      q: new Float32Array(this.size),
      length: this.size
    }
    for (var i = 0; i < slice.length; i += 2) {
      iq.i[i] = this._toFloat(slice, i)
      iq.q[i] = this._toFloat(slice, i + 1)
    }
    this.push(toMagnitudes(fft(reverseBits(iq))))
  }
  cb(null)
}

FFTStream.prototype._toFloat = function (buf, i) {
  var n = this.signed ? buf.readInt8(i) : buf.readUInt8(i)
  if (!this.signed) n -= 128
  return n / 128
}

module.exports = {
  FFTStream: FFTStream,
  createStream: function (opts) {
    return new FFTStream(opts)
  }
}
