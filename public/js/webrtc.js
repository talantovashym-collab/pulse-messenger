// Pulse WebRTC Voice & Video Call Engine
class PulseCallManager {
  constructor() {
    this.socket = null;
    this.currentUser = null;
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.activeCall = null;
    this.callTimer = null;
    this.callSeconds = 0;
    this.isMuted = false;
    this.isVideoOff = false;

    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
  }

  init(socket, currentUser) {
    this.socket = socket;
    this.currentUser = currentUser;
    this.bindSocketEvents();
    this.bindUIEvents();
  }

  // Create canvas / audio fallback stream if device has no physical camera/mic
  createFallbackStream(includeVideo = true) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const dest = audioCtx.createMediaStreamDestination();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    gain.gain.value = 0.0001; // nearly silent carrier
    osc.connect(gain);
    gain.connect(dest);
    osc.start();

    const fallbackStream = dest.stream;

    if (includeVideo) {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      // Draw modern pulsating gradient
      ctx.fillStyle = '#17212b';
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = '#5288c1';
      ctx.font = '28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Pulse Video Stream', 320, 240);

      const videoStream = canvas.captureStream(15);
      videoStream.getVideoTracks().forEach(t => fallbackStream.addTrack(t));
    }

    return fallbackStream;
  }

  async acquireMedia(callType) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video'
      });
      return stream;
    } catch (err) {
      console.warn('Physical camera/mic not available, using high-definition fallback stream:', err);
      return this.createFallbackStream(callType === 'video');
    }
  }

  createPeerConnection() {
    this.peerConnection = new RTCPeerConnection(this.rtcConfig);

    this.remoteStream = new MediaStream();
    const remoteVideoEl = document.getElementById('remoteVideo');
    if (remoteVideoEl) {
      remoteVideoEl.srcObject = this.remoteStream;
    }

    // Attach local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }

    // Handle remote tracks
    this.peerConnection.ontrack = (event) => {
      event.streams[0].getTracks().forEach(track => {
        this.remoteStream.addTrack(track);
      });
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.activeCall) {
        this.socket.emit('call:signal', {
          to: this.activeCall.peerId,
          from: this.currentUser.id,
          signal: { type: 'candidate', candidate: event.candidate }
        });
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      if (!this.peerConnection) return;
      const state = this.peerConnection.connectionState;
      if (state === 'connected') {
        this.onCallConnected();
      } else if (state === 'disconnected' || state === 'failed') {
        this.endCall(false);
      }
    };
  }

  // --- OUTGOING CALL ---
  async startCall(peerId, peerName, peerAvatar, chatId, callType = 'audio') {
    if (this.activeCall) return;

    this.activeCall = {
      peerId,
      peerName,
      peerAvatar,
      chatId,
      callType,
      role: 'caller',
      status: 'ringing'
    };

    this.localStream = await this.acquireMedia(callType);
    this.showCallModal();
    this.updateCallUIStatus(`Ringing ${peerName}...`);

    window.sounds.startOutgoingRinging();

    this.socket.emit('call:initiate', {
      callerId: this.currentUser.id,
      recipientId: peerId,
      chatId,
      callType
    });
  }

  // --- INCOMING CALL ---
  handleIncomingCall({ callerId, callerName, callerAvatar, chatId, callType }) {
    if (this.activeCall) {
      // Busy
      this.socket.emit('call:reject', {
        callerId,
        recipientId: this.currentUser.id,
        reason: 'busy'
      });
      return;
    }

    this.activeCall = {
      peerId: callerId,
      peerName: callerName,
      peerAvatar: callerAvatar,
      chatId,
      callType,
      role: 'callee',
      status: 'incoming'
    };

    window.sounds.startIncomingRingtone();
    this.showIncomingDialog(callerName, callerAvatar, callType);
  }

  async acceptCall() {
    this.hideIncomingDialog();
    window.sounds.stopRinging();

    if (!this.activeCall) return;

    this.localStream = await this.acquireMedia(this.activeCall.callType);
    this.showCallModal();
    this.updateCallUIStatus('Connecting...');

    this.createPeerConnection();

    this.socket.emit('call:accept', {
      callerId: this.activeCall.peerId,
      recipientId: this.currentUser.id
    });
  }

  rejectCall(reason = 'declined') {
    this.hideIncomingDialog();
    window.sounds.stopRinging();

    if (this.activeCall) {
      this.socket.emit('call:reject', {
        callerId: this.activeCall.peerId,
        recipientId: this.currentUser.id,
        reason
      });
      this.activeCall = null;
    }
  }

  async onCallAccepted() {
    window.sounds.stopRinging();
    this.updateCallUIStatus('Connecting media...');

    this.createPeerConnection();

    // Caller creates SDP Offer
    try {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      this.socket.emit('call:signal', {
        to: this.activeCall.peerId,
        from: this.currentUser.id,
        signal: { type: 'offer', sdp: offer.sdp }
      });
    } catch (err) {
      console.error('Failed to create offer:', err);
    }
  }

  async handleSignal({ from, signal }) {
    if (!this.peerConnection || !this.activeCall || from !== this.activeCall.peerId) return;

    try {
      if (signal.type === 'offer') {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        this.socket.emit('call:signal', {
          to: this.activeCall.peerId,
          from: this.currentUser.id,
          signal: { type: 'answer', sdp: answer.sdp }
        });
      } else if (signal.type === 'answer') {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
      } else if (signal.type === 'candidate' && signal.candidate) {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch (err) {
      console.error('Signaling error:', err);
    }
  }

  onCallConnected() {
    window.sounds.stopRinging();
    this.activeCall.status = 'connected';
    this.startCallTimer();
    this.updateCallUIStatus('Connected');
  }

  startCallTimer() {
    this.callSeconds = 0;
    const timerEl = document.getElementById('callTimerDisplay');
    clearInterval(this.callTimer);
    this.callTimer = setInterval(() => {
      this.callSeconds++;
      const mins = Math.floor(this.callSeconds / 60).toString().padStart(2, '0');
      const secs = (this.callSeconds % 60).toString().padStart(2, '0');
      if (timerEl) timerEl.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  endCall(notifyPeer = true) {
    window.sounds.stopRinging();
    clearInterval(this.callTimer);

    if (notifyPeer && this.activeCall && this.socket) {
      this.socket.emit('call:end', {
        peerId: this.activeCall.peerId,
        from: this.currentUser.id
      });
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.activeCall = null;
    this.hideCallModal();
    this.hideIncomingDialog();
  }

  // Media Controls
  toggleMute() {
    if (!this.localStream) return;
    this.isMuted = !this.isMuted;
    this.localStream.getAudioTracks().forEach(t => { t.enabled = !this.isMuted; });
    const btn = document.getElementById('callMuteBtn');
    if (btn) btn.classList.toggle('active', this.isMuted);
  }

  toggleVideo() {
    if (!this.localStream) return;
    this.isVideoOff = !this.isVideoOff;
    this.localStream.getVideoTracks().forEach(t => { t.enabled = !this.isVideoOff; });
    const btn = document.getElementById('callVideoToggleBtn');
    if (btn) btn.classList.toggle('active', this.isVideoOff);
  }

  // --- UI BINDINGS ---
  bindSocketEvents() {
    this.socket.on('call:incoming', (data) => this.handleIncomingCall(data));
    this.socket.on('call:accepted', () => this.onCallAccepted());
    this.socket.on('call:rejected', ({ reason }) => {
      window.sounds.stopRinging();
      alert(`Call ${reason || 'ended'}`);
      this.endCall(false);
    });
    this.socket.on('call:unavailable', ({ reason }) => {
      window.sounds.stopRinging();
      alert(`User unavailable: ${reason}`);
      this.endCall(false);
    });
    this.socket.on('call:signal', (data) => this.handleSignal(data));
    this.socket.on('call:ended', () => {
      this.endCall(false);
    });
  }

  bindUIEvents() {
    const acceptBtn = document.getElementById('incomingAcceptBtn');
    if (acceptBtn) acceptBtn.onclick = () => this.acceptCall();

    const declineBtn = document.getElementById('incomingDeclineBtn');
    if (declineBtn) declineBtn.onclick = () => this.rejectCall('declined');

    const endBtn = document.getElementById('callHangupBtn');
    if (endBtn) endBtn.onclick = () => this.endCall(true);

    const muteBtn = document.getElementById('callMuteBtn');
    if (muteBtn) muteBtn.onclick = () => this.toggleMute();

    const videoBtn = document.getElementById('callVideoToggleBtn');
    if (videoBtn) videoBtn.onclick = () => this.toggleVideo();
  }

  showIncomingDialog(name, avatar, callType) {
    const dialog = document.getElementById('incomingCallDialog');
    document.getElementById('incomingCallerName').textContent = name;
    document.getElementById('incomingCallerAvatar').src = avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150';
    document.getElementById('incomingCallType').textContent = callType === 'video' ? '📹 Incoming Video Call...' : '📞 Incoming Voice Call...';
    dialog.classList.add('active');
  }

  hideIncomingDialog() {
    const dialog = document.getElementById('incomingCallDialog');
    if (dialog) dialog.classList.remove('active');
  }

  showCallModal() {
    const modal = document.getElementById('callModal');
    if (!this.activeCall) return;

    document.getElementById('callPeerName').textContent = this.activeCall.peerName;
    document.getElementById('callPeerAvatar').src = this.activeCall.peerAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150';

    const localVideoEl = document.getElementById('localVideo');
    if (localVideoEl && this.localStream) {
      localVideoEl.srcObject = this.localStream;
    }

    const isVideo = this.activeCall.callType === 'video';
    document.getElementById('callVideoArea').style.display = isVideo ? 'flex' : 'none';
    document.getElementById('callAudioArea').style.display = isVideo ? 'none' : 'flex';

    modal.classList.add('active');
  }

  hideCallModal() {
    const modal = document.getElementById('callModal');
    if (modal) modal.classList.remove('active');
  }

  updateCallUIStatus(status) {
    const statusEl = document.getElementById('callStatusLabel');
    if (statusEl) statusEl.textContent = status;
  }
}

window.pulseCallManager = new PulseCallManager();
