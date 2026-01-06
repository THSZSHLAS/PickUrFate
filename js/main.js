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
        this.selectedCard = null; // 这个变量现在代表“正在悬浮的卡片”
        this.dwellTime = 0;
        this.lastTime = performance.now();

        this.loop();
    }

    updateUI(card, statusText) {
        const nameEl = document.getElementById('hex-name');
        const descEl = document.getElementById('hex-desc');
        
        if (statusText) {
            nameEl.innerText = statusText;
            descEl.innerText = "";
            return;
        }

        if (card) {
            nameEl.innerText = card.userData.name;
            descEl.innerText = `Hexagram ${card.userData.id}`;
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
        // 如果已经选中了卡片（悬浮中），就不再检测 hover 了
        if (!this.selectedCard) {
            const found = this.scene.pickCard(handState.ndcX, handState.ndcY);
            
            if (found && found === this.hoveredCard) {
                this.dwellTime += dt;
            } else {
                this.dwellTime = 0;
                this.hoveredCard = found;
            }
        } else {
            this.hoveredCard = null;
        }

        // --- 交互阶段 1: Pinch to Float (选择并悬浮) ---
        if (handState.pinchTriggered && this.hoveredCard && !this.selectedCard && this.dwellTime > 0.1) {
            this.selectedCard = this.hoveredCard;
            
            // 触发 3D 悬浮
            this.scene.floatCard(this.selectedCard);
            
            // 触发 2D 波纹特效
            this.overlay.triggerSelectionRipple(this.selectedCard.userData);
            
            this.updateUI(this.selectedCard);
            console.log("Floating:", this.selectedCard.userData.name);
        }

        // --- 交互阶段 2: Open Palm to Explode (张手炸碎) ---
        if (handState.palmTriggered && this.selectedCard) {
            this.scene.explodeCard(this.selectedCard);
            
            this.updateUI(null, "Void Manifested");
            
            // 清空选中状态，等待下一次选择
            this.selectedCard = null;
        }

        this.scene.update(dt, this.hoveredCard);
        this.overlay.update();

        requestAnimationFrame(() => this.loop());
    }
}

window.addEventListener('load', () => {
    new App();
});
