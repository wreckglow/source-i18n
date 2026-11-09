import { createServer } from 'node:http'
import { Engine } from '../../dist/esm/unplugin/engine.js'

const root = process.argv[2]
const engine = new Engine({ root })
const stack = []
engine.attachMiddleware({ use: (fn) => stack.push(fn) })

const server = createServer((req, res) => {
  let index = 0
  const next = () => {
    const fn = stack[index++]
    if (fn) fn(req, res, next)
    else {
      res.statusCode = 404
      res.end('not found')
    }
  }
  next()
})

server.listen(0, '127.0.0.1', () => {
  process.stdout.write(JSON.stringify({ port: server.address().port, token: engine.devToken }) + '\n')
})
