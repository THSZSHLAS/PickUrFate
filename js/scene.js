import * as THREE from 'three';
// 注意这里变成了 'three/addons/...' 并且加上了 .js 后缀
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export class SceneManager {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        this.raycaster = new THREE.Raycaster();
        this.cards = [];
        this.ringGroup = new THREE.Group();
        this.scene.add(this.ringGroup);

        this.rotationSpeed = 0.002;
        this.targetRotation = 0;
        this.currentRotation = 0;
        
        this.initPostProcessing();
        this.initBackground();
        this.camera.position.z = 0; // Center of ring
        
        window.addEventListener('resize', () => this.onResize());
    }

    initPostProcessing() {
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        
        const bloom = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.6, // Strength
            0.4, // Radius
            0.85 // Threshold
        );
        this.composer.addPass(bloom);
    }

    initBackground() {
        const starGeo = new THREE.BufferGeometry();
        const starCount = 600;
        const posArr = new Float32Array(starCount * 3);
        for(let i=0; i<starCount*3; i++) posArr[i] = (Math.random() - 0.5) * 100;
        starGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
        const starMat = new THREE.PointsMaterial({ color: 0xaa9977, size: 0.05, transparent: true, opacity: 0.4 });
        this.stars = new THREE.Points(starGeo, starMat);
        this.scene.add(this.stars);
    }

    createRing(hexagramData) {
        const radius = 10;
        const cardGeo = new THREE.PlaneGeometry(1, 1.5);

        hexagramData.forEach((data, i) => {
            const angle = (i / 64) * Math.PI * 2;
            const texture = this.createCardTexture(data);
            const material = new THREE.MeshBasicMaterial({ 
                map: texture, 
                side: THREE.DoubleSide,
                transparent: true 
            });
            const card = new THREE.Mesh(cardGeo, material);
            
            card.position.x = Math.sin(angle) * radius;
            card.position.z = Math.cos(angle) * radius;
            card.lookAt(0, 0, 0);
            
            card.userData = { ...data, angle: angle };
            this.cards.push(card);
            this.ringGroup.add(card);
        });
    }

    createCardTexture(data) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 384;
        const ctx = canvas.getContext('2d');

        // Paper Background
        ctx.fillStyle = '#f4f1ea';
        ctx.fillRect(0, 0, 256, 384);

        // Faint Cloud Motif
        ctx.globalAlpha = 0.05;
        ctx.strokeStyle = '#2c2c2c';
        ctx.beginPath();
        for(let i=0; i<3; i++) {
            ctx.arc(Math.random()*256, Math.random()*384, 50, 0, Math.PI*2);
        }
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        // Gold Border
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 6;
        ctx.strokeRect(10, 10, 236, 364);

        // Hexagram Lines
        const lineW = 120;
        const lineH = 12;
        const startY = 280;
        const gap = 20;

        ctx.fillStyle = '#1a1a1a';
        data.lines.forEach((isYang, idx) => {
            const y = startY - (idx * gap);
            if (isYang) {
                ctx.fillRect(128 - lineW/2, y, lineW, lineH);
            } else {
                ctx.fillRect(128 - lineW/2, y, lineW * 0.4, lineH);
                ctx.fillRect(128 + lineW * 0.1, y, lineW * 0.4, lineH);
            }
        });

        // Title
        ctx.fillStyle = '#1a1a1a';
        ctx.font = '16px serif';
        ctx.textAlign = 'center';
        ctx.fillText(data.name.toUpperCase(), 128, 330);
        ctx.font = '10px serif';
        ctx.fillText(`NO. ${data.id.toString().padStart(2, '0')}`, 128, 350);

        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 8;
        return tex;
    }

    pickCard(ndcX, ndcY) {
        this.raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
        const intersects = this.raycaster.intersectObjects(this.cards);
        return intersects.length > 0 ? intersects[0].object : null;
    }

    explodeCard(card) {
        if (!card) return;
        
        const count = 100;
        const pos = card.position.clone();
        const geo = new THREE.BufferGeometry();
        const verts = new Float32Array(count * 3);
        const vels = [];

        for(let i=0; i<count; i++) {
            verts[i*3] = pos.x;
            verts[i*3+1] = pos.y;
            verts[i*3+2] = pos.z;
            vels.push(new THREE.Vector3(
                (Math.random()-0.5)*0.2,
                (Math.random()-0.5)*0.2,
                (Math.random()-0.5)*0.2
            ));
        }

        geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
        const mat = new THREE.PointsMaterial({ color: 0xd4af37, size: 0.1 });
        const particles = new THREE.Points(geo, mat);
        this.scene.add(particles);

        // Simple animation logic in state
        card.visible = false;
        setTimeout(() => {
            this.scene.remove(particles);
            card.visible = true;
            card.scale.set(1,1,1);
        }, 1500);

        return { mesh: particles, vels: vels };
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.composer.setSize(window.innerWidth, window.innerHeight);
    }

    update(dt, hoveredCard) {
        // Rotation & Magnet
        if (hoveredCard) {
            // Magnetic effect: rotate ring to bring card towards center (angle 0)
            const targetAngle = -hoveredCard.userData.angle;
            this.currentRotation += (targetAngle - this.currentRotation) * 0.05;
        } else {
            this.currentRotation += this.rotationSpeed;
        }
        this.ringGroup.rotation.y = this.currentRotation;

        // Animate Cards
        this.cards.forEach(c => {
            const isHovered = (c === hoveredCard);
            const targetScale = isHovered ? 1.15 : 1.0;
            c.scale.lerp(new THREE.Vector3(targetScale, targetScale, 1), 0.1);
            
            // Material highlight
            c.material.opacity = isHovered ? 1.0 : 0.7;
        });

        this.stars.rotation.y += 0.0005;
        this.composer.render();
    }

}
