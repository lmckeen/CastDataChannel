let context

export function setContext(castContext) {
  context = castContext
}

export function send(type, data) {
  context.sendCustomMessage(`urn:x-cast:com.castdatachannel.${type}`, undefined, data)
}

export function receive(type, cb) {
  context.addCustomMessageListener(`urn:x-cast:com.castdatachannel.${type}`, cb)
}