export class HandTracker {
    constructor() {
        this.video = document.getElementById('input-video');
        this.debugCanvas = document.getElementById('debug-canvas');
        this.ctx = this.debugCanvas.getContext('2d');

        this.state = {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            ndcX: 0,
            ndcY: 0,
            isPinching: false,
            isOpenPalm: false,
            handDetected: false,
            pinchTriggered: false,
            palmTriggered: false
        };

        this.smoothing = 0.25;
        this.lastPinch = false;
        this.lastPalm = false;
        this.palmCooldown = 0;

        // Try to init, if Hands not loaded yet, wait a bit
        if (window.Hands) {
            this.initMediaPipe();
        } else {
            console.warn("MediaPipe Hands not loaded yet, waiting...");
            window.addEventListener('load', () => this.initMediaPipe());
        }

        this.initMouseFallback();
    }

    async initMediaPipe() {
        if (!window.Hands) {
            console.error("MediaPipe Hands failed to load.");
            return;
        }

        const hands = new window.Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.7
        });

        hands.onResults((results) => this.onResults(results));

        if (this.video) {
            const camera = new window.Camera(this.video, {
                onFrame: async () => {
                    await hands.send({ image: this.video });
                },
                width: 640,
                height: 480
            });

            try {
                await camera.start();
                document.getElementById('cam-status').innerText = "Camera Active";
            } catch (e) {
                document.getElementById('cam-status').innerText = "Camera Access Denied - Using Mouse";
                console.warn("Camera failed, fallback to mouse.", e);
            }
        }
    }

    onResults(results) {
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            this.state.handDetected = true;

            // Tracking Index Tip (Landmark 8)
            const indexTip = landmarks[8];
            // Mirror X for intuitive interaction
            const targetX = (1 - indexTip.x) * window.innerWidth;
            const targetY = indexTip.y * window.innerHeight;

            // Smoothing
            this.state.x += (targetX - this.state.x) * this.smoothing;
            this.state.y += (targetY - this.state.y) * this.smoothing;
            this.state.ndcX = (this.state.x / window.innerWidth) * 2 - 1;
            this.state.ndcY = -(this.state.y / window.innerHeight) * 2 + 1;

            // Pinch Detection (Thumb Tip 4 vs Index Tip 8)
            const thumbTip = landmarks[4];
            const dx = indexTip.x - thumbTip.x;
            const dy = indexTip.y - thumbTip.y;
            const dist = Math.sqrt(dx*dx + dy*dy);

            // Normalize distance based on hand size (Wrist 0 to Middle MCP 9)
            const wrist = landmarks[0];
            const midMcp = landmarks[9];
            const handSize = Math.sqrt(Math.pow(wrist.x-midMcp.x, 2) + Math.pow(wrist.y-midMcp.y, 2));

            this.state.isPinching = (dist < handSize * 0.35); // Adjusted threshold
            if (this.state.isPinching && !this.lastPinch) this.state.pinchTriggered = true;
            this.lastPinch = this.state.isPinching;

            // Open Palm Detection
            // Check if fingertips 8, 12, 16, 20 are all higher (lower Y value) than their PIP joints
            const fingersOpen = [8, 12, 16, 20].every(idx => landmarks[idx].y < landmarks[idx-2].y);
            this.state.isOpenPalm = fingersOpen;

            if (this.state.isOpenPalm && !this.lastPalm && Date.now() > this.palmCooldown) {
                this.state.palmTriggered = true;
                this.palmCooldown = Date.now() + 1000;
            }
            this.lastPalm = this.state.isOpenPalm;

            // Debug Drawing
            this.drawDebug(landmarks);
        } else {
            this.state.handDetected = false;
        }
    }

    initMouseFallback() {
        window.addEventListener('mousemove', (e) => {
            if (this.state.handDetected) return;
            this.state.x = e.clientX;
            this.state.y = e.clientY;
            this.state.ndcX = (e.clientX / window.innerWidth) * 2 - 1;
            this.state.ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
        });
        window.addEventListener('mousedown', () => {
            if (!this.state.handDetected) this.state.pinchTriggered = true;
        });
    }

    drawDebug(landmarks) {
        this.ctx.clearRect(0, 0, 160, 120);
        this.ctx.fillStyle = "#00ff00";
        landmarks.forEach(pt => {
            this.ctx.beginPath();
            this.ctx.arc((1 - pt.x) * 160, pt.y * 120, 2, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    update() {
        const p = this.state.pinchTriggered;
        const o = this.state.palmTriggered;
        // Do not reset boolean flags here immediately if you want them to last one frame
        // But for this loop structure, it works if update is called once per frame
        this.state.pinchTriggered = false;
        this.state.palmTriggered = false;
        return { ...this.state, pinchTriggered: p, palmTriggered: o };
    }
}