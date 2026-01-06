import { HandTracker } from './handTracker.js';
import { SceneManager } from './scene.js';
import { hexagramData } from './hexagrams.js';
import { OverlayManager } from './overlay.js';

class App {
    constructor() {
        this.scene = new SceneManager();
        this.hands = new HandTracker();
        this.overlay = new OverlayManager();
        this.cursorEl = document.getElementById('hand-cursor');
        
        this.scene.createRing(hexagramData);
        
        this.hoveredCard = null;
        this.selectedCard = null;
        this.dwellTime = 0;
        this.lastTime = performance.now();

        this.loop();
    }

    updateUI(card) {
        const nameEl = document.getElementById('hex-name');
        const descEl = document.getElementById('hex-desc');
        if (card) {
            nameEl.innerText = card.userData.name;
            descEl.innerText = `Hexagram ${card.userData.id} - Interactive 3D Model`;
        }
    }

    loop() {
        const now = performance.now();
        const dt = (now - this.lastTime) / 1000;
        this.lastTime = now;

        const handState = this.hands.update();

        // Cursor Logic
        this.cursorEl.style.left = `${handState.x}px`;
        this.cursorEl.style.top = `${handState.y}px`;
        if (handState.isPinching) {
            this.cursorEl.classList.add('pinching');
        } else {
            this.cursorEl.classList.remove('pinching');
        }

        // Interaction Logic
        const found = this.scene.pickCard(handState.ndcX, handState.ndcY);
        
        if (found && found === this.hoveredCard) {
            this.dwellTime += dt;
        } else {
            this.dwellTime = 0;
            this.hoveredCard = found;
        }

        // Selection (Pinch)
        if (handState.pinchTriggered && this.hoveredCard) {
            this.selectedCard = this.hoveredCard;
            this.overlay.triggerSelectionRipple(this.selectedCard.userData);
            this.updateUI(this.selectedCard);
        }

        // Explosion (Open Palm)
        if (handState.palmTriggered && this.selectedCard) {
            this.scene.explodeCard(this.selectedCard);
            this.selectedCard = null;
            document.getElementById('hex-name').innerText = "Void Manifested";
        }

        this.scene.update(dt, this.hoveredCard);
        this.overlay.update();

        requestAnimationFrame(() => this.loop());
    }
}

// Start App
window.addEventListener('load', () => {
    new App();
});