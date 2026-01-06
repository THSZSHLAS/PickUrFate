import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export class SceneManager {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.scene = new THREE.Scene();
        // 调整相机视场角(FOV)为50，减少边缘拉伸，视觉更平正
        this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        this.raycaster = new THREE.Raycaster();
        this.cards = [];
        this.explosions = []; 
        this.ringGroup = new THREE.Group();
        this.scene.add(this.ringGroup);

        this.rotationSpeed = 0.0004; // 基础极慢自转
        this.currentRotation = 0;
        this.floatingCard = null; 
        
        this.initPostProcessing();
        this.initBackground();
        
        // 相机位置稍微拉远一点，因为圆环变大了
        this.camera.position.z = 0; 
        
        window.addEventListener('resize', () => this.onResize());
    }

    initPostProcessing() {
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        
        const bloom = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.6, 0.4, 0.85
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
        // --- 修改点 1: 增大半径以产生间隔 ---
        // 原来是 10，现在改为 14。周长变大，卡片宽度不变，自然就有缝隙了。
        const radius = 14; 
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

        // 纸张背景
        ctx.fillStyle = '#f4f1ea';
        ctx.fillRect(0, 0, 256, 384);

        // 淡淡的云纹水印
        ctx.globalAlpha = 0.05;
        ctx.strokeStyle = '#2c2c2c';
        ctx.beginPath();
        for(let i=0; i<3; i++) ctx.arc(Math.random()*256, Math.random()*384, 50, 0, Math.PI*2);
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        // 金边
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 6;
        ctx.strokeRect(10, 10, 236, 364);

        // 卦象线条
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

        // 文字
        ctx.fillStyle = '#1a1a1a';
        ctx.font = '16px serif';
        ctx.textAlign = 'center';
        ctx.fillText(data.name.toUpperCase(), 128, 330);
        ctx.font = '10px serif';
        ctx.fillText(`NO. ${data.id.toString().padStart(2, '0')}`, 128, 350);

        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    pickCard(ndcX, ndcY) {
        if (this.floatingCard) return null;

        this.raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
        const intersects = this.raycaster.intersectObjects(this.cards);
        return intersects.length > 0 ? intersects[0].object : null;
    }

    floatCard(card) {
        if (!card || this.floatingCard) return;

        this.floatingCard = card;

        const worldPos = new THREE.Vector3();
        card.getWorldPosition(worldPos);
        const worldQuat = new THREE.Quaternion();
        card.getWorldQuaternion(worldQuat);

        this.ringGroup.remove(card);
        this.scene.add(card);

        card.position.copy(worldPos);
        card.quaternion.copy(worldQuat);
    }

    explodeCard(card) {
        if (!card) return;
        
        const count = 300;
        const pos = card.position.clone();
        
        const geo = new THREE.BufferGeometry();
        const verts = new Float32Array(count * 3);
        const vels = [];

        for(let i=0; i<count; i++) {
            verts[i*3] = pos.x + (Math.random()-0.5);
            verts[i*3+1] = pos.y + (Math.random()-0.5)*1.5;
            verts[i*3+2] = pos.z + (Math.random()-0.5);
            
            vels.push({
                x: (Math.random()-0.5)*0.15,
                y: (Math.random()-0.5)*0.15,
                z: (Math.random()-0.5)*0.15
            });
        }

        geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
        const mat = new THREE.PointsMaterial({ color: 0xd4af37, size: 0.06, transparent: true });
        const particles = new THREE.Points(geo, mat);
        this.scene.add(particles);

        this.explosions.push({ mesh: particles, vels: vels, age: 0, life: 2.0 });

        this.scene.remove(card);
        if (this.floatingCard === card) {
            this.floatingCard = null;
        }
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.composer.setSize(window.innerWidth, window.innerHeight);
    }

    update(dt, hoveredCard) {
        // --- 旋转逻辑优化 ---
        if (hoveredCard && !this.floatingCard) {
            const targetAngle = -hoveredCard.userData.angle;
            let delta = targetAngle - this.currentRotation;
            while (delta <= -Math.PI) delta += Math.PI*2;
            while (delta > Math.PI) delta -= Math.PI*2;
            
            // --- 修改点 2: 悬浮时的对齐速度 ---
            // 之前是 0.05，现在改为 0.015
            // 这里的数字越小，圆环对齐选定卡片时的转动就越慢、越平滑
            this.currentRotation += delta * 0.015;
            
        } else {
            this.currentRotation += this.rotationSpeed;
        }
        
        this.currentRotation = this.currentRotation % (Math.PI * 2);
        this.ringGroup.rotation.y = this.currentRotation;

        // 悬浮动画
        if (this.floatingCard) {
            const targetPos = new THREE.Vector3(0, 0, -3.5); 
            targetPos.applyQuaternion(this.camera.quaternion);
            targetPos.add(this.camera.position);

            this.floatingCard.position.lerp(targetPos, 0.05);
            this.floatingCard.lookAt(this.camera.position);
            this.floatingCard.position.y += Math.sin(Date.now() * 0.002) * 0.001;
            this.floatingCard.scale.lerp(new THREE.Vector3(1.5, 1.5, 1.5), 0.05);
        }

        // 普通卡片动画
        this.cards.forEach(c => {
            if (c === this.floatingCard) return;

            const isHovered = (c === hoveredCard);
            const targetScale = isHovered ? 1.15 : 1.0;
            c.scale.lerp(new THREE.Vector3(targetScale, targetScale, 1), 0.1);
            c.material.opacity = isHovered ? 1.0 : 0.6;
        });

        // 粒子更新
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const exp = this.explosions[i];
            exp.age += dt;
            if (exp.age > exp.life) {
                this.scene.remove(exp.mesh);
                exp.mesh.geometry.dispose();
                exp.mesh.material.dispose();
                this.explosions.splice(i, 1);
                continue;
            }

            const positions = exp.mesh.geometry.attributes.position.array;
            for(let j=0; j < exp.vels.length; j++) {
                positions[j*3] += exp.vels[j].x;
                positions[j*3+1] += exp.vels[j].y;
                positions[j*3+2] += exp.vels[j].z;
            }
            exp.mesh.geometry.attributes.position.needsUpdate = true;
            exp.mesh.material.opacity = 1 - (exp.age / exp.life);
        }

        this.stars.rotation.y += 0.0002;
        this.composer.render();
    }
}
