export class OverlayManager {
    constructor() {
        this.canvas = document.getElementById('overlay-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        this.ripples = [];
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    triggerSelectionRipple(hexData) {
        this.ripples.push({
            lines: hexData.lines,
            radius: 50,
            opacity: 1.0,
            startTime: Date.now()
        });
    }

    update() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;

        for (let i = this.ripples.length - 1; i >= 0; i--) {
            const r = this.ripples[i];
            const elapsed = Date.now() - r.startTime;
            
            r.radius += 5;
            r.opacity -= 0.015;

            if (r.opacity <= 0) {
                this.ripples.splice(i, 1);
                continue;
            }

            this.ctx.strokeStyle = `rgba(212, 175, 55, ${r.opacity})`;
            this.ctx.lineWidth = 2;

            // Draw hexagram expansion
            r.lines.forEach((isYang, idx) => {
                const yOffset = (idx - 2.5) * (r.radius * 0.15);
                const w = r.radius * 2;
                
                if (isYang) {
                    this.ctx.strokeRect(centerX - w/2, centerY + yOffset, w, 2);
                } else {
                    this.ctx.strokeRect(centerX - w/2, centerY + yOffset, w * 0.4, 2);
                    this.ctx.strokeRect(centerX + w * 0.1, centerY + yOffset, w * 0.4, 2);
                }
            });
        }
    }
}