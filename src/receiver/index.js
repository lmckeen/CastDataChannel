import { receive, send, setContext } from "./messages"

const connectedCallback = []
const disconnectedCallback = []
const dataCallback = []

export class CastDataChannel {
  #dataChannel
  #context
  #rtcConnection

  constructor() {
    this.#setupRtc()

    this.#context = cast.framework.CastReceiverContext.getInstance()

    setContext(this.#context)

    receive('connected', () => {
      send('connected', {})
    })

    receive('ice', ({ data }) => {
      this.#rtcConnection.addIceCandidate(data)
        .catch(console.warn)
    })

    receive('offer', ({ data }) => {
      this.#rtcConnection.setRemoteDescription(data)
        .catch(console.warn)

      this.#createAnswer(this.#rtcConnection)
    })
  }

  #setupRtc = () => {
    this.#rtcConnection = new RTCPeerConnection(null)

    this.#rtcConnection.onicecandidate = ({ candidate }) => {
      if (!candidate) return
      send('ice', candidate)
    }

    this.#rtcConnection.ondatachannel = (data) => {
      this.#dataChannel = data.channel

      this.#dataChannel.onopen = (e) => {
        if (connectedCallback.length <= 0) return
        connectedCallback.forEach(cb => cb(e))
      }

      this.#dataChannel.onclose = (e) => {
        this.#rtcConnection.close()
        this.#setupRtc()
        if (disconnectedCallback.length <= 0) return
        disconnectedCallback.forEach(cb => cb(e))
      }

      this.#dataChannel.onmessage = (event) => {
        if (dataCallback.length <= 0) return
        dataCallback.forEach(cb => cb(JSON.parse(event.data)))
      }
    }
  }

  #createAnswer = (connection) => {
    connection.createAnswer().then(offer => {
      connection.setLocalDescription(offer)
        .catch(console.warn)

      send('offer', offer)
    })
    .catch(console.warn)
  }

  onData(cb) {
    dataCallback.push(cb)
  }

  send(data) {
    if (this.#dataChannel.readyState !== 'open') return
    this.#dataChannel.send(JSON.stringify(data))
  }

  onConnected(cb) {
    connectedCallback.push(cb)
  }

  onDisconnected(cb) {
    disconnectedCallback.push(cb)
  }

  close() {
    this.#dataChannel.close()
  }

  start(options = {}) {
    const newOptions = {
      customNamespaces: {
        ...options.customNamespaces,
        'urn:x-cast:com.castdatachannel.ice': 'JSON',
        'urn:x-cast:com.castdatachannel.offer': 'JSON',
        'urn:x-cast:com.castdatachannel.connected': 'JSON'
      }
    }

    this.#context.start({
      ...options,
      ...newOptions
    })

    return this.#context
  }
}
