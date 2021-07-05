let session

export function setSession(castSession) {
  session = castSession
}

export function send(type, data) {
  session?.sendMessage(`urn:x-cast:com.castdatachannel.${type}`, data)
}

export function receive(type, cb) {
  session?.addMessageListener(`urn:x-cast:com.castdatachannel.${type}`, (namespace, data) => cb(data))
}