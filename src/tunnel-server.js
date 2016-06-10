var tls = require('tls')
var net = require('net')
var debug = require('debug')('tunnels:tunnel-server')

module.exports = function (opts) {
  var hosts = opts.hosts
  var secure = opts.secure
  var tlsOpts = { key: opts.key, cert: opts.cert }
  var tunnelPort = opts.tunnelPort

  var server = secure && secure !== 'external'
    ? tls.createServer(tlsOpts, onconnection)
    : net.createServer(onconnection)

  return server.listen(tunnelPort, err => {
    if (err) return opts.emit('error', err)
    debug(`server listening on ${tunnelPort}`)
    server.emit('ready')
  })

  function onconnection (socket) {
    opts.connectionCount++
    var request, host, address = `${socket.remoteAddress}:${socket.remotePort}`
    debug(`connection from ${address} did open`)

    socket.once('data', chunk => {
      host = hosts.bySession[chunk.toString()]
      if (host) {
        socket.setTimeout(60000)
        request = host.requests.shift()
        if (request) {
          socket.write(request.firstChunk)
          delete request.firstChunk
          request.pipe(socket).pipe(request)
          debug(`connection from ${address} did connect to "${host.name}" via ${request.remoteAddress}:${request.remotePort}`)
        } else {
          socket.destroy()
        }
      } else {
        socket.destroy()
      }
    })

    socket.setTimeout(5000, () => {
      debug(`connection from ${address} timed out`)
      socket.destroy()
    })

    socket.on('close', () => {
      opts.connectionCount--
      if (host) {
        if (request) {
          request.destroy()
          debug(`connection from ${address} connected to "${host.name}" via ${request.remoteAddress}:${request.remotePort} did close`)
        } else {
          debug(`connection from ${address} connected to "${host.name}" did close`)
        }
      } else {
        debug(`connection from ${address} did close without connecting`)
      }
    })
  }
}
