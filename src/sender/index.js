import { receive, send, setSession } from "./messages"

const connectedCallback = []
const disconnectedCallback = []
const dataCallback = []
const percentageCallback = []

export class CastDataChannel {
  #dataChannel
  #rtcConnection
  #activeSession
  #dataToSend = []

  constructor() {
    const context = cast.framework.CastContext.getInstance()
    const contextEvents = cast.framework.CastContextEventType

    context.addEventListener(contextEvents.SESSION_STATE_CHANGED, (data) => {
      setSession(undefined)
      this.#activeSession = data.sessionState === 'SESSION_STARTED' || data.sessionState === 'SESSION_RESUMED'

      if (!this.#activeSession) return this.#rtcConnection?.close()
      setSession (data.session)
      this.#startConnected()
    })
  }

  #setupRtc = () => {
    this.#dataToSend.length = 0
    this.#dataChannel = undefined
    this.#rtcConnection = new RTCPeerConnection(null)

    this.#rtcConnection.onconnectionstatechange = () => {
      if (this.#rtcConnection?.connectionState !== 'disconnected' && !this.activeSession) return
      this.#setupRtc()
      this.#createOffer(this.#rtcConnection)
    }

    this.#rtcConnection.onicecandidate = ({ candidate }) => {
      if (!candidate) return
      send('ice', candidate)
    }

    receive('ice', data => {
      const dataObj = typeof data === 'string' ? JSON.parse(data) : data
      this.#rtcConnection?.addIceCandidate(dataObj)
        .catch(console.warn)
    })

    this.#createDataChannel()
  }

  #createDataChannel = () => {
    this.#dataChannel = this.#rtcConnection?.createDataChannel('CastDataChannel')
    this.#dataChannel.bufferedAmountLowThreshold = 25000

    this.#dataChannel.onopen = (e) => {
      if (connectedCallback.length <= 0) return
      connectedCallback.forEach(cb => cb(e))
    }

    this.#dataChannel.onclose = (e) => {
      this.#startConnected()
      if (disconnectedCallback.length <= 0) return
      disconnectedCallback.forEach(cb => cb(e))
    }

    this.#dataChannel.onbufferedamountlow = () => {
      while (this.#dataChannel?.bufferedAmount < 50000 && this.#dataToSend.length > 0) {
        this.#dispatch()
      }
    }

    this.#dataChannel.onmessage = (event) => {
      if (dataCallback.length <= 0) return
      dataCallback.forEach(cb => cb(JSON.parse(event.data)))
    }
  }

  #createOffer = (connection) => {
    connection?.createOffer().then(offer => {
      connection?.setLocalDescription(offer)
        .catch(console.warn)

      send('offer', offer)

      receive('offer', data => {
        if (connection.signalingState !== 'have-local-offer') return

        const dataObj = typeof data === 'string' ? JSON.parse(data) : data
        connection?.setRemoteDescription(dataObj)
          .catch(console.warn)
      })
    })
  }

  #startConnected = () => {
    this.#whenConnected()
      .then(() => {
        this.#setupRtc()
        this.#createOffer(this.#rtcConnection)
      })
      .catch(console.warn)
  }

  #whenConnected = () => {
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (!this.#activeSession) return clearInterval(interval)
        send('connected', {})
      }, 100)

      setTimeout(() => {
        reject('timeout')
      }, 30000)

      receive('connected', () => {
        clearInterval(interval)
        resolve()
      })
    })
  }

  #dispatch = () => {
    if (this.#dataChannel?.readyState !== 'open') return

    const item = this.#dataToSend.shift()

    if (!item) return

    const percent = (item.value.index+1)/item.value.length

    percentageCallback.forEach(cb => {
      cb(percent)
    })

    this.#dataChannel?.send(JSON.stringify(item))
  }

  send(data) {
    this.#dataToSend.push(data)

    if (this.#dataChannel?.bufferedAmount === 0) {
      this.#dispatch()
    }
  }

  onData(cb) {
    dataCallback.push(cb)
  }

  onPercentage(cb) {
    percentageCallback.push(cb)
  }

  onConnected(cb) {
    connectedCallback.push(cb)
  }

  onDisconnected(cb) {
    disconnectedCallback.push(cb)
  }

  clearBuffer(timeout = 10000) {
    this.#dataToSend = []
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (this.#dataChannel?.bufferedAmount === 0) {
          resolve()
        }
      }, 100)

      setTimeout(() => {
        clearInterval(interval)
        reject('timeout')
      }, timeout)
    })
  }

  close() {
    if (!this.#dataChannel) return

    this.#dataChannel?.close()
  }
}
