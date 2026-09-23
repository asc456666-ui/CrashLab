import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Materials, skyTexture } from './Materials.js';
import { createBox, createCylinder } from '../physics/Helpers.js';

/**
 * Crash Test Arena 碰撞试验场。
 * 地面、跑道、混凝土墙、三级跳台、障碍区、坠落高台、重物装置，以及四个出生点。
 */
export class Arena {
  constructor(ctx) {
    this.ctx = ctx;
    this.dynamicSpawns = [];
    this.heavyBlock = null;

    this.spawnPoints = [
      { pos: [0, 1.4, -250], yaw: 0 },
      { pos: [-38, 1.4, -46], yaw: 0 },
      { pos: [-90, 32, -112], yaw: 0 },
      { pos: [0, 1.4, 46], yaw: 180 },
      { pos: [-20, 1.4, 58], yaw: 0 },
      { pos: [20, 1.4, 54], yaw: 0 },
      { pos: [-20, 1.4, -252], yaw: 0 },
      { pos: [40, 1.4, -110], yaw: 0 },
      { pos: [22, 1.4, -92], yaw: 0 },
      { pos: [26, 1.4, -250], yaw: 0 },
      { pos: [-120, 1.4, -50], yaw: 0 },
      { pos: [0, 1.4, 180], yaw: 0 }
    ];

    // 水池范围，车辆进入后会被拖慢，视觉上是一片浅水
    this.waterZones = [
      { minX: 8, maxX: 36, minZ: -128, maxZ: -76, y: 0.22 }
    ];
    ctx.waterZones = this.waterZones;

    this.build();
  }

  build() {
    this.buildEnvironment();
    this.buildGroundAndTrack();
    this.buildCrashWall();
    this.buildRamps();
    this.buildObstacleField();
    this.buildDropTower();
    this.buildHeavyDrop();
    this.buildBowlingAlley();
    this.buildBrickWalls();
    this.buildWaveTrack();
    this.buildLoopTrack();
    this.buildPool();
    this.buildGarage();
    this.buildForest();
    this.buildCity();
    this.recordDynamicSpawns();
  }

  buildEnvironment() {
    const { scene } = this.ctx;

    const sky = skyTexture();
    scene.background = sky;
    scene.environment = sky;

    // 环境光压低、日光加强，否则混凝土会被天光染成蓝色
    const hemi = new THREE.HemisphereLight(0xdfeaf5, 0x6b6156, 0.7);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff4e2, 2.7);
    sun.position.set(60, 90, 40);
    if (this.ctx.shadows) {
      sun.castShadow = true;
      const s = this.ctx.shadowSize;
      sun.shadow.mapSize.set(s, s);
      // 阴影相机只覆盖车辆周围一小片区域，由 Game 每帧跟随车辆移动，
      // 这样整个试验场都有阴影，且贴图精度足够高。
      const d = 55;
      sun.shadow.camera.left = -d;
      sun.shadow.camera.right = d;
      sun.shadow.camera.top = d;
      sun.shadow.camera.bottom = -d;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 400;
      sun.shadow.bias = -0.0008;
      scene.add(sun.target);
    }
    scene.add(sun);
    this.sun = sun;
  }

  buildGroundAndTrack() {
    const { scene, world } = this.ctx;

    // 主地面在山林那一块是挖空的。
    // 地面必须挖空，否则山林的洼地会低于地面，车轮射线先打到地面，
    // 车等于在平地上跑，起伏完全感觉不到，还会撞到地块侧面。
    // 填这个洞的方式是把地面拆成四块围成一个框。
    const F = 300;
    const hx0 = -185;
    const hx1 = -55;
    const hz0 = -60;
    // 收到 174，给北侧城市区域的地基留出一截，免得两块地面叠在一起
    const hz1 = 174;
    const slabs = [
      { x0: -F, x1: hx0, z0: -F, z1: F },
      { x0: hx1, x1: F, z0: -F, z1: F },
      { x0: hx0, x1: hx1, z0: -F, z1: hz0 },
      { x0: hx0, x1: hx1, z0: hz1, z1: F }
    ];

    const asphalt = Materials.asphalt();
    for (const s of slabs) {
      const w = s.x1 - s.x0;
      const d = s.z1 - s.z0;

      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), asphalt);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((s.x0 + s.x1) / 2, 0, (s.z0 + s.z1) / 2);
      mesh.receiveShadow = this.ctx.shadows;
      scene.add(mesh);

      // 地面必须用 Box。cannon-es 的 Plane 旋转后世界 AABB 计算错误，
      // 会让车辆前半部分的悬挂射线完全检测不到地面。
      const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(w / 2, 1, d / 2)) });
      body.position.set((s.x0 + s.x1) / 2, -1, (s.z0 + s.z1) / 2);
      // 地面永远不可破坏，打穿了整个场地就塌了
      body.noBreak = true;
      world.addBody(body);
      body.updateAABB();
    }

    // 跑道白色边线。极速到 300 公里每小时以后需要很长的助跑距离，
    // 所以跑到从 z 负两百六一直铺到撞墙前。
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8 });
    for (const x of [-8, 8]) {
      createBox(this.ctx, { size: [0.35, 0.02, 410], pos: [x, 0.02, -55], mass: 0, material: lineMat, castShadow: false });
    }

    // 跑道中线虚线
    for (let z = -256; z < 148; z += 12) {
      createBox(this.ctx, { size: [0.3, 0.02, 6], pos: [0, 0.02, z], mass: 0, material: lineMat, castShadow: false });
    }

    // 起点格子线
    createBox(this.ctx, { size: [16, 0.03, 1.2], pos: [0, 0.03, -258], mass: 0, material: lineMat, castShadow: false });
  }

  buildCrashWall() {
    // 极速提到 300 以后需要更长的助跑，撞墙整体往后挪到 z 一百五
    const z = 150;

    createBox(this.ctx, { size: [26, 6, 2], pos: [0, 3, z], mass: 0, material: Materials.concrete() });
    createBox(this.ctx, { size: [26, 0.6, 3], pos: [0, 6.3, z], mass: 0, material: Materials.hazard() });

    // 两侧加固墩
    for (const x of [-14, 14]) {
      createBox(this.ctx, { size: [3, 3, 3], pos: [x, 1.5, z - 4], mass: 0, material: Materials.concrete() });
    }

    // 金属护栏，撞上去会飞
    for (let i = 0; i < 6; i++) {
      createBox(this.ctx, {
        size: [5, 1.1, 0.5],
        pos: [-13 + i * 5.2, 0.9, z - 8],
        mass: 18,
        material: Materials.metal()
      });
    }
  }

  buildRamps() {
    const baseX = -38;

    // 坡面角度不能太陡。车身俯仰角一旦超过坡角，前轮的悬挂射线会探不到坡面，
    // 前轮失重就没有牵引力，车会被坡顶住。27 度那版跑车一冲就卡，
    // 现在收到 22 度，配合更长的坡长仍然能飞很高。
    const ramps = [
      { z: -30, angle: 14, width: 9, length: 8 },
      { z: -6, angle: 18, width: 10, length: 11 },
      { z: 24, angle: 22, width: 12, length: 16 }
    ];

    for (const r of ramps) {
      this.buildRamp(baseX, r.z, r.angle, r.width, r.length);
    }

    // 大跳台落地区的水泥地
    createBox(this.ctx, { size: [30, 0.1, 26], pos: [baseX, 0.05, 34], mass: 0, material: Materials.concrete(), castShadow: false });
  }

  /**
   * 一个起飞坡。
   *
   * 三个关键点，缺一个车要么卡死要么直接飞不起来。
   *
   * 一、绕 X 轴取负角，让迎车那侧低、背面高。取正角的话车正面撞上的是坡的竖直端面。
   *
   * 二、高度以坡的顶面为基准，让低端顶面前缘贴地。
   *     公式是 centerY = gap - halfThick * cos + (length / 2) * sin。
   *     中间那个符号极易写错，写成减号就会把整块坡压到地面以下，
   *     只留一条几厘米的边露出来，场地看上去就是一片平地。
   *     校验方法：低端顶面应等于 gap，高端顶面应等于 gap 加 length 乘 sin。
   *
   * 三、坡体本身做厚，一路埋到地面以下，不要另外加矩形支撑座。
   *     支撑座比坡面高的话会在坡上立起一道台阶，车头直接撞进支撑座里。
   */
  buildRamp(cx, cz, angle, width, length, material = null) {
    const a = THREE.MathUtils.degToRad(angle);
    const cos = Math.cos(a);
    const sin = Math.sin(a);

    const gap = 0.02;
    const halfThick = 1.1;
    const centerY = gap - halfThick * cos + (length / 2) * sin;

    createBox(this.ctx, {
      size: [width, halfThick * 2, length],
      pos: [cx, centerY, cz],
      rot: [-angle, 0, 0],
      mass: 0,
      material: material || Materials.hazard()
    });

    return { topY: length * sin + gap, centerY };
  }

  buildObstacleField() {
    const ox = 42;
    const oz = 0;

    // 水泥墩（可被撞飞）
    for (let i = 0; i < 8; i++) {
      createBox(this.ctx, {
        size: [1.4, 1.4, 1.4],
        pos: [ox - 6 + (i % 4) * 3.2, 0.7, oz - 10 + Math.floor(i / 4) * 6],
        mass: 24,
        material: Materials.concrete()
      });
    }

    // 金属桶
    for (let i = 0; i < 6; i++) {
      createCylinder(this.ctx, {
        radius: 0.55,
        height: 1.3,
        pos: [ox + 4 + (i % 3) * 2.2, 0.65, oz - 8 + Math.floor(i / 3) * 5],
        mass: 14,
        material: Materials.metalDark()
      });
    }

    // 木箱
    for (let i = 0; i < 6; i++) {
      createBox(this.ctx, {
        size: [1.6, 1.6, 1.6],
        pos: [ox - 2 + (i % 3) * 2.4, 0.8 + (i > 2 ? 1.7 : 0), oz + 12 + Math.floor(i / 3) * 2],
        mass: 10,
        material: Materials.wood()
      });
    }

    // 大石块（静态）
    for (let i = 0; i < 3; i++) {
      createBox(this.ctx, {
        size: [2.6, 2.2, 2.6],
        pos: [ox + 12 + i * 5, 1.1, oz + 6 - i * 7],
        rot: [0, i * 37, 0],
        mass: 0,
        material: Materials.rock()
      });
    }

    // 圆柱路障
    for (let i = 0; i < 5; i++) {
      createCylinder(this.ctx, {
        radius: 0.28,
        height: 1.6,
        pos: [ox - 10, 0.8, oz - 14 + i * 6],
        mass: 6,
        material: Materials.hazard()
      });
    }

    // 减速带（静态扁平）
    for (let i = 0; i < 3; i++) {
      createBox(this.ctx, {
        size: [12, 0.28, 1.4],
        pos: [ox - 4, 0.14, oz - 20 + i * 14],
        mass: 0,
        material: Materials.hazard()
      });
    }

    // 固定护栏墙
    createBox(this.ctx, { size: [0.6, 1.4, 34], pos: [ox + 20, 0.7, oz], mass: 0, material: Materials.metal() });
  }

  buildDropTower() {
    // 跑道延长到 z 负两百六以后，原来放在 z 负一一二的坠台会挡住跑道，
    // 整体挪到左边空地
    const px = -90;
    const pz = -112;
    const h = 30;

    // 平台
    createBox(this.ctx, { size: [26, 1.2, 26], pos: [px, h, pz], mass: 0, material: Materials.concrete() });

    // 支柱
    for (const dx of [-11, 11]) {
      for (const dz of [-11, 11]) {
        createBox(this.ctx, { size: [1.2, h, 1.2], pos: [px + dx, h / 2, pz + dz], mass: 0, material: Materials.metalDark() });
      }
    }

    // 左右两侧警示栏。正前方必须敞开，否则车冲不下去
    createBox(this.ctx, { size: [0.5, 0.5, 26], pos: [px - 12.6, h + 0.9, pz], mass: 0, material: Materials.hazard() });
    createBox(this.ctx, { size: [0.5, 0.5, 26], pos: [px + 12.6, h + 0.9, pz], mass: 0, material: Materials.hazard() });

    // 下方坚固水泥地
    createBox(this.ctx, { size: [40, 0.4, 40], pos: [px, 0.2, pz], mass: 0, material: Materials.concrete(), castShadow: false });

    // 通往平台的斜坡
    createBox(this.ctx, {
      size: [10, 0.8, 40],
      pos: [px - 22, h * 0.5, pz + 22],
      rot: [0, 90, -34],
      mass: 0,
      material: Materials.concrete()
    });
  }

  buildHeavyDrop() {
    const x = 0;
    const z = 46;

    // 四根导轨柱
    for (const dx of [-5, 5]) {
      for (const dz of [-5, 5]) {
        createBox(this.ctx, { size: [0.7, 20, 0.7], pos: [x + dx, 10, z + dz], mass: 0, material: Materials.metalDark() });
      }
    }

    // 顶部横梁
    createBox(this.ctx, { size: [12, 0.8, 12], pos: [x, 20.4, z], mass: 0, material: Materials.metalDark() });

    // 重物块。保持动态刚体但一开始让它睡眠，等效于被吊住；
    // 点落锤时唤醒，就变成自由落体。比改 type 更可靠。
    const block = createBox(this.ctx, {
      size: [6, 6, 6],
      pos: [x, 17, z],
      mass: 900,
      material: Materials.metal()
    });

    block.body.allowSleep = true;
    block.body.sleep();
    block.body.sleepSpeedLimit = 0.05;
    this.heavyBlock = block;

    // 地面标记
    createBox(this.ctx, { size: [14, 0.06, 14], pos: [x, 0.03, z], mass: 0, material: Materials.hazard(), castShadow: false });
  }

  /** F 区 保龄球道：一条木质车道加十个球瓶，正面冲过去能一次全打飞。 */
  buildBowlingAlley() {
    const cx = -20;
    const z0 = 60;
    const z1 = 100;

    createBox(this.ctx, {
      size: [10, 0.06, z1 - z0],
      pos: [cx, 0.03, (z0 + z1) / 2],
      mass: 0,
      material: Materials.wood(),
      castShadow: false
    });

    // 两侧挡板，防止瓶子滚得到处都是
    for (const dx of [-5.2, 5.2]) {
      createBox(this.ctx, {
        size: [0.4, 0.8, z1 - z0],
        pos: [cx + dx, 0.4, (z0 + z1) / 2],
        mass: 0,
        material: Materials.metalDark()
      });
    }

    // 十个球瓶按三角排布，尖头朝向来的方向
    const pinMat = new THREE.MeshStandardMaterial({ color: 0xf6f1e7, roughness: 0.42 });
    const rows = [1, 2, 3, 4];
    for (let r = 0; r < rows.length; r++) {
      for (let k = 0; k < rows[r]; k++) {
        createCylinder(this.ctx, {
          radius: 0.24,
          height: 1.5,
          pos: [cx + (k - (rows[r] - 1) / 2) * 1.2, 0.75, z1 - 9 + r * 1.5],
          mass: 3,
          material: pinMat
        });
      }
    }
  }

  /** G 区 砖墙阵：三面可以一块块撞穿的砖墙，破坏反馈最直接。 */
  buildBrickWalls() {
    const cx = 20;
    const brickMat = new THREE.MeshStandardMaterial({ color: 0xb5512f, roughness: 0.86 });
    const cols = 4;
    const rows = 3;

    createBox(this.ctx, {
      size: [9, 0.04, 34],
      pos: [cx, 0.02, 72],
      mass: 0,
      material: Materials.hazard(),
      castShadow: false
    });

    for (let i = 0; i < 3; i++) {
      const z = 62 + i * 10;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          createBox(this.ctx, {
            size: [1.8, 0.6, 0.6],
            pos: [cx - 2.7 + c * 1.8, 0.34 + r * 0.62, z],
            mass: 8,
            material: brickMat
          });
        }
      }
    }
  }

  /** H 区 连续坡道：一串小坡，冲过去会连续腾空，用来做空中特技。 */
  buildWaveTrack() {
    const cx = -20;
    const z0 = -244;
    const gap = 15;
    // 起伏要够高才看得出是连续飞坡，最高那个接近三米半
    const angles = [13, 17, 21, 15, 19, 14];

    createBox(this.ctx, {
      size: [15, 0.04, angles.length * gap + 12],
      pos: [cx, 0.02, z0 + ((angles.length - 1) * gap) / 2],
      mass: 0,
      material: Materials.hazard(),
      castShadow: false
    });

    for (let i = 0; i < angles.length; i++) {
      this.buildRamp(cx, z0 + i * gap, angles[i], 15, 10);
    }
  }

  /**
   * I 区 360 度垂直圆环。
   * 用一圈静态方块拼出圆环内壁，车高速冲进底部就能沿内壁转一整圈。
   * 悬挂射线始终朝远离圆心的方向，正好落在内壁上，所以射线车也能跑竖直圆环。
   */
  buildLoopTrack() {
    const cx = 40;
    const cz = -190;
    const R = 12;
    const segs = 28;
    const width = 15;
    const halfThick = 0.45;

    // 助跑与落地平台
    createBox(this.ctx, {
      size: [width + 6, 0.06, 46],
      pos: [cx, 0.03, cz + 28],
      mass: 0,
      material: Materials.concrete(),
      castShadow: false
    });

    const shellMat = Materials.metal();
    for (let i = 0; i < segs; i++) {
      const t = (i / segs) * Math.PI * 2;
      const deg = (t * 180) / Math.PI;
      createBox(this.ctx, {
        size: [width, halfThick * 2, (2 * Math.PI * R) / segs + 0.5],
        pos: [cx, R + (R + halfThick) * Math.cos(t), cz + (R + halfThick) * Math.sin(t)],
        rot: [deg, 0, 0],
        mass: 0,
        material: shellMat
      });
    }

    // 圆环内部区域。相机进到这里要换成贴身机位，否则圆环壁会把视线整个挡住
    this.loopZone = {
      minX: cx - width / 2 - 4,
      maxX: cx + width / 2 + 4,
      minZ: cz - R - 5,
      maxZ: cz + R + 5
    };
    this.ctx.loopZone = this.loopZone;
  }

  /** J 区 水池：一片浅水，车进去会被明显拖慢，出水面会溅起水花。 */
  buildPool() {
    const cx = 22;
    const cz = -102;
    const w = 28;
    const d = 52;

    createBox(this.ctx, {
      size: [w, 0.4, d],
      pos: [cx, -0.2, cz],
      mass: 0,
      material: Materials.concrete(),
      castShadow: false
    });

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({
        color: 0x2f7fd4,
        transparent: true,
        opacity: 0.62,
        roughness: 0.12,
        metalness: 0.35
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(cx, 0.22, cz);
    this.ctx.scene.add(water);
    this.waterMesh = water;

    // 池边只留很薄的一道沿，车能直接碾进去也能开出来。
    // 之前做成半米多高的围条，车一冲进去就被挡住出不来。
    for (const sx of [-1, 1]) {
      createBox(this.ctx, {
        size: [0.9, 0.12, d],
        pos: [cx + sx * (w / 2 + 0.45), 0.06, cz],
        mass: 0,
        material: Materials.concrete(),
        castShadow: false
      });
    }
    for (const sz of [-1, 1]) {
      createBox(this.ctx, {
        size: [w + 1.8, 0.12, 0.9],
        pos: [cx, 0.06, cz + sz * (d / 2 + 0.45)],
        mass: 0,
        material: Materials.concrete(),
        castShadow: false
      });
    }
  }

  /** K 区 车库。出生点带一个车库造型，卷帘门收在顶上，车直接开出去。 */
  buildGarage() {
    const cx = 26;
    const cz = -252;
    const w = 12;
    const d = 14;
    const h = 6;

    createBox(this.ctx, {
      size: [w + 2, 0.08, d + 2],
      pos: [cx, 0.04, cz],
      mass: 0,
      material: Materials.concrete(),
      castShadow: false
    });

    // 左右墙与后墙
    for (const sx of [-1, 1]) {
      createBox(this.ctx, {
        size: [0.5, h, d],
        pos: [cx + sx * (w / 2), h / 2, cz],
        mass: 0,
        material: Materials.concrete()
      });
    }
    createBox(this.ctx, {
      size: [w + 0.5, h, 0.5],
      pos: [cx, h / 2, cz - d / 2],
      mass: 0,
      material: Materials.concrete()
    });

    createBox(this.ctx, {
      size: [w + 1.6, 0.4, d + 1.6],
      pos: [cx, h + 0.2, cz],
      mass: 0,
      material: Materials.metalDark()
    });

    // 卷帘门框，门帘收在顶上，留出净空让车开出去
    createBox(this.ctx, {
      size: [w, 1.3, 0.45],
      pos: [cx, h - 0.65, cz + d / 2],
      mass: 0,
      material: Materials.hazard()
    });
    for (const sx of [-1, 1]) {
      createBox(this.ctx, {
        size: [0.45, h, 0.45],
        pos: [cx + sx * (w / 2 - 0.22), h / 2, cz + d / 2],
        mass: 0,
        material: Materials.hazard()
      });
    }

    // 地面停车标线
    for (const sx of [-1, 1]) {
      createBox(this.ctx, {
        size: [0.25, 0.02, d - 3],
        pos: [cx + sx * 3.6, 0.09, cz],
        mass: 0,
        material: Materials.hazard(),
        castShadow: false
      });
    }
  }

  /**
   * 山林的高程函数。三个不同波长的正弦叠在一起，
   * 得到的是连成一片、坡度平缓的丘陵，不是一个挨一个的独立斜坡。
   * 最大坡度约十六度，最高落差六米以内，车能顺着坡面连续上下。
   */
  forestHeightAt(lx, lz) {
    // 波长要明显大于地块尺寸。波长一短，平面地块就贴合不住曲面，
    // 相邻地块在交界处会错开半米以上，露出的垂直侧面就是一道台阶，车头撞上去直接停住。
    const u = lx / 34;
    const v = lz / 46;

    const h =
      0.78 * Math.sin(u * 1.15 + 0.4) * Math.cos(v * 1.05 - 0.3) +
      0.52 * Math.sin(u * 1.9 - 1.2) * Math.sin(v * 1.6 + 0.8) +
      0.27 * Math.sin((u + v) * 2.4);

    // 边缘渐隐回零，和周围主地面平滑接上，进出山林不会有门槛
    const fx = Math.min(1, (65 - Math.abs(lx)) / 14);
    const fz = Math.min(1, (120 - Math.abs(lz)) / 16);
    const fade = Math.max(0, Math.min(fx, fz));

    // 围绕零上下起伏，有高有低。整片抬高的做法会让山林变成一块台地，
    // 看着全是凸起，进出还要翻一道大坡。
    return h * fade;
  }

  /**
   * L 区 山林。起伏的缓坡地形加可以撞倒的树。
   *
   * 地面按高程函数切成三列十四行的小块拼起来。每块的四角高度都取自同一条高程函数，
   * 相邻块共享角点，所以整片地面是连续的曲面，只有很轻微的折角，看起来就是丘陵。
   * 草地只是高度有起伏，不额外加阻力，车上去照样能加速。
   */
  buildForest() {
    const cx = -120;
    const cz = 60;
    const w = 130;
    const d = 240;
    const cols = 6;
    const rows = 20;
    const cellW = w / cols;
    const cellD = d / rows;
    // 块做薄。厚块的垂直侧面露得多，交界处更容易顶住车头
    const thickness = 1.2;
    // 块之间多留重叠，把交界处的错台埋在里面
    const overlap = 1.2;

    const grassMat = new THREE.MeshStandardMaterial({ color: 0x4d7f42, roughness: 0.95 });

    for (let ci = 0; ci < cols; ci++) {
      for (let ri = 0; ri < rows; ri++) {
        const x0 = -w / 2 + ci * cellW;
        const x1 = x0 + cellW;
        const z0 = -d / 2 + ri * cellD;
        const z1 = z0 + cellD;

        const h00 = this.forestHeightAt(x0, z0);
        const h10 = this.forestHeightAt(x1, z0);
        const h01 = this.forestHeightAt(x0, z1);
        const h11 = this.forestHeightAt(x1, z1);

        // 位置用块中心的高程，四角平均会在曲率大的地方偏出去一米多，
        // 那样相邻块之间会出现明显的台阶
        const topY = this.forestHeightAt((x0 + x1) / 2, (z0 + z1) / 2);
        const slopeZ = Math.atan2((h01 + h11) / 2 - (h00 + h10) / 2, cellD);
        const slopeX = Math.atan2((h10 + h11) / 2 - (h00 + h01) / 2, cellW);

        createBox(this.ctx, {
          size: [cellW + overlap, thickness, cellD + overlap],
          pos: [cx + (x0 + x1) / 2, topY - thickness / 2 + 0.06, cz + (z0 + z1) / 2],
          rot: [-THREE.MathUtils.radToDeg(slopeZ), 0, THREE.MathUtils.radToDeg(slopeX)],
          mass: 0,
          material: grassMat
        });
      }
    }

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.92 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6b34, roughness: 0.86 });

    // 树的位置避开出生点周围，免得一出生就撞树
    const spots = [
      [cx - 52, cz - 96], [cx - 18, cz - 78], [cx + 22, cz - 92], [cx + 52, cz - 66],
      [cx - 56, cz - 30], [cx - 6, cz - 44], [cx + 44, cz - 24], [cx - 60, cz + 26],
      [cx + 26, cz + 8], [cx - 14, cz + 44], [cx + 50, cz + 46], [cx - 44, cz + 70],
      [cx + 8, cz + 88], [cx - 54, cz + 108], [cx + 40, cz + 104], [cx - 10, cz + 122]
    ];

    for (const [x, z] of spots) {
      const baseY = this.forestHeightAt(x - cx, z - cz);
      this.addTree(x, z, baseY, trunkMat, leafMat);
    }
  }

  /** 一棵可以撞倒的树。树干树冠合成一个网格组，物理体是圆柱，站在地面高度上。 */
  addTree(x, z, baseY, trunkMat, leafMat) {
    const group = new THREE.Group();

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.6, 5.4, 8), trunkMat);
    trunk.position.y = -1;
    trunk.castShadow = this.ctx.shadows;
    group.add(trunk);

    const crown = new THREE.Mesh(new THREE.ConeGeometry(2.6, 6.4, 9), leafMat);
    crown.position.y = 3.4;
    crown.castShadow = this.ctx.shadows;
    group.add(crown);

    const centerY = baseY + 3.6;
    group.position.set(x, centerY, z);
    this.ctx.scene.add(group);

    const body = new CANNON.Body({
      mass: 42,
      shape: new CANNON.Cylinder(0.7, 0.9, 7.2, 8)
    });
    body.position.set(x, centerY, z);
    body.linearDamping = 0.05;
    body.angularDamping = 0.15;
    this.ctx.world.addBody(body);
    body.updateAABB();

    this.ctx.dynamics.push({ mesh: group, body });
  }

  /**
   * M 区 城市。十字马路加沿街建筑，路上有能撞飞的车辆与行人。
   * 建筑做成一块块拼起来，坦克开炮就能打塌。
   */
  buildCity() {
    const cx = 0;
    const cz = 230;

    createBox(this.ctx, {
      size: [150, 0.06, 110],
      pos: [cx, 0.03, cz],
      mass: 0,
      material: Materials.concrete(),
      castShadow: false
    });

    const roadMat = new THREE.MeshStandardMaterial({ color: 0x33363b, roughness: 0.88 });
    createBox(this.ctx, {
      size: [150, 0.05, 18],
      pos: [cx, 0.05, cz],
      mass: 0,
      material: roadMat,
      castShadow: false
    });
    createBox(this.ctx, {
      size: [18, 0.05, 110],
      pos: [cx, 0.05, cz],
      mass: 0,
      material: roadMat,
      castShadow: false
    });

    // 马路黄线
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xe8d34a, roughness: 0.7 });
    for (let x = -72; x <= 72; x += 12) {
      if (Math.abs(x) < 12) continue;
      createBox(this.ctx, { size: [6, 0.02, 0.3], pos: [cx + x, 0.09, cz], mass: 0, material: lineMat, castShadow: false });
    }
    for (let z = -50; z <= 50; z += 12) {
      if (Math.abs(z) < 12) continue;
      createBox(this.ctx, { size: [0.3, 0.02, 6], pos: [cx, 0.09, cz + z], mass: 0, material: lineMat, castShadow: false });
    }

    // 沿街建筑，做成一块块拼的，被打中会整栋塌
    const blocks = [
      [-44, -32], [-44, 30], [42, -32], [42, 30], [-62, 34]
    ];
    for (let i = 0; i < blocks.length; i++) {
      this.addBuilding(cx + blocks[i][0], cz + blocks[i][1], i);
    }

    // 马路上的车与街边的行人，都会沿着路线来回走
    this.movers = [];

    const cars = [
      { x: cx - 52, z: cz - 4.6, to: cx + 52, axis: 'x', color: 0xd8d8dc },
      { x: cx + 52, z: cz - 4.6, to: cx - 52, axis: 'x', color: 0x4f7fd9 },
      { x: cx - 30, z: cz + 4.6, to: cx + 30, axis: 'x', color: 0xd9b34f },
      { x: cx + 4.6, z: cz - 44, to: cz + 44, axis: 'z', color: 0x53a05a },
      { x: cx + 4.6, z: cz + 40, to: cz - 40, axis: 'z', color: 0xd94f4f },
      { x: cx - 4.6, z: cz - 20, to: cz + 30, axis: 'z', color: 0xe0e0e0 }
    ];
    for (const c of cars) {
      if (c.axis === 'x') {
        this.addTrafficCar(c.x, c.z, c.to, c.z, c.color);
      } else {
        this.addTrafficCar(c.x, c.z, c.x, c.to, c.color);
      }
    }

    const peds = [
      [-14, -9, 22, -9], [14, 9, -22, 9], [-33, 12, -33, 44], [33, -12, 33, -44],
      [11, -42, -11, -42], [-11, 42, 11, 42]
    ];
    for (const [ax, az, bx, bz] of peds) {
      this.addPedestrian(cx + ax, cz + az, cx + bx, cz + bz);
    }
  }

  /**
   * 城市交通车。简化外壳加四个轮子，沿一条直线来回开。
   * 被撞飞或者翻掉之后过几秒回到原位重新上路。
   */
  addTrafficCar(x, z, gx, gz, color) {
    const group = new THREE.Group();

    const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.7 });

    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.72, 3.9), paint);
    bodyMesh.castShadow = this.ctx.shadows;
    group.add(bodyMesh);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.54, 1.8), Materials.glass());
    cabin.position.set(0, 0.62, -0.15);
    group.add(cabin);

    for (const sx of [-0.86, 0.86]) {
      for (const sz of [-1.25, 1.25]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.24, 12), dark);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(sx, -0.42, sz);
        group.add(wheel);
      }
    }

    group.position.set(x, 0.72, z);
    this.ctx.scene.add(group);

    const body = new CANNON.Body({
      mass: 240,
      shape: new CANNON.Box(new CANNON.Vec3(0.9, 0.52, 2.0))
    });
    body.position.set(x, 0.72, z);
    body.linearDamping = 0.06;
    body.angularDamping = 0.16;
    this.ctx.world.addBody(body);
    body.updateAABB();
    this.ctx.dynamics.push({ mesh: group, body });

    this.movers.push({
      kind: 'car',
      body,
      from: { x, z },
      goal: { x: gx, z: gz },
      speed: 7 + Math.random() * 3,
      knocked: false,
      knockTimer: 0,
      home: { x, y: 0.72, z }
    });
  }

  /**
   * 街上走的行人。躯干加头加两条会摆的腿。
   * 沿人行道来回走，被撞倒就躺几秒然后回到原位继续走。
   */
  addPedestrian(x, z, gx, gz) {
    const group = new THREE.Group();

    const shirt = new THREE.MeshStandardMaterial({
      color: [0xd94f4f, 0x4f7fd9, 0xd9b34f, 0x53a05a, 0x9a5ad9, 0xe08a3c][Math.floor(Math.random() * 6)],
      roughness: 0.72
    });
    const pants = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xe8b98f, roughness: 0.65 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), shirt);
    torso.position.y = 0.2;
    torso.castShadow = this.ctx.shadows;
    group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), skin);
    head.position.y = 0.7;
    head.castShadow = this.ctx.shadows;
    group.add(head);

    // 腿的几何原点挪到顶端，这样绕 X 轴转动时是迈步而不是整体旋转
    const legGeo = new THREE.BoxGeometry(0.18, 0.76, 0.2);
    legGeo.translate(0, -0.38, 0);

    const legs = [];
    for (const sx of [-0.14, 0.14]) {
      const leg = new THREE.Mesh(legGeo, pants);
      leg.position.set(sx, -0.1, 0);
      leg.castShadow = this.ctx.shadows;
      group.add(leg);
      legs.push(leg);
    }

    group.position.set(x, 1.0, z);
    this.ctx.scene.add(group);

    const body = new CANNON.Body({
      mass: 34,
      shape: new CANNON.Cylinder(0.28, 0.28, 1.7, 8)
    });
    body.position.set(x, 1.0, z);
    body.linearDamping = 0.08;
    body.angularDamping = 0.24;
    this.ctx.world.addBody(body);
    body.updateAABB();
    this.ctx.dynamics.push({ mesh: group, body });

    this.movers.push({
      kind: 'ped',
      body,
      legs,
      phase: Math.random() * 6.28,
      from: { x, z },
      goal: { x: gx, z: gz },
      speed: 1.6 + Math.random() * 0.9,
      knocked: false,
      knockTimer: 0,
      home: { x, y: 1.0, z }
    });
  }

  /**
   * 行人车辆的巡逻与恢复。每帧把它们的水平速度指向目标点，
   * 被撞飞或撞倒就停一会儿再回原位。
   */
  updateMovers(dt) {
    if (!this.movers) return;

    const now = performance.now();

    for (const m of this.movers) {
      const body = m.body;

      if (m.knocked) {
        m.knockTimer -= dt;
        if (m.knockTimer <= 0) this.resetMover(m);
        continue;
      }

      // 翻倒或者被撞飞了就进入倒地状态
      const q = body.quaternion;
      const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
      const speed = Math.hypot(body.velocity.x, body.velocity.z);
      if (upY < 0.55 || speed > 10) {
        m.knocked = true;
        m.knockTimer = 5;
        continue;
      }

      const dx = m.goal.x - body.position.x;
      const dz = m.goal.z - body.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist < 1.5) {
        const swap = m.from;
        m.from = m.goal;
        m.goal = swap;
        continue;
      }

      const vx = (dx / dist) * m.speed;
      const vz = (dz / dist) * m.speed;
      body.velocity.x = vx;
      body.velocity.z = vz;

      // 保持直立，只留朝向
      body.quaternion.setFromEuler(0, Math.atan2(vx, vz), 0);
      body.angularVelocity.set(0, 0, 0);

      if (m.legs) {
        const swing = Math.sin(now * 0.009 + m.phase) * 0.55;
        m.legs[0].rotation.x = swing;
        m.legs[1].rotation.x = -swing;
      }
    }
  }

  resetMover(m) {
    const body = m.body;
    m.knocked = false;
    m.knockTimer = 0;

    body.position.set(m.home.x, m.home.y, m.home.z);
    body.quaternion.setFromEuler(0, 0, 0);
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
    body.force.set(0, 0, 0);
    body.torque.set(0, 0, 0);
    body.wakeUp();
  }

  /** 一栋楼。二乘二共四块，每块都能单独被打飞。 */
  addBuilding(x, z, seed) {
    const shellMat = new THREE.MeshStandardMaterial({
      color: [0x9aa3ad, 0xb0a89b, 0x8e9aa6, 0xa89a8e, 0x97a5b2][seed % 5],
      roughness: 0.82
    });
    const winMat = new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.35, metalness: 0.2 });

    const bw = 7;
    const bh = 8;
    const bd = 7;

    for (let col = 0; col < 2; col++) {
      for (let lv = 0; lv < 2; lv++) {
        const px = x + (col === 0 ? -bw / 2 : bw / 2);
        const py = bh / 2 + lv * bh;
        const pz = z;

        const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw - 0.1, bh - 0.1, bd), shellMat);
        mesh.castShadow = this.ctx.shadows;
        mesh.receiveShadow = this.ctx.shadows;
        this.ctx.scene.add(mesh);

        // 朝马路那一面贴一排窗
        const win = new THREE.Mesh(new THREE.BoxGeometry(bw - 2, 1.1, 0.2), winMat);
        win.position.set(0, 0.6, bd / 2 + 0.1);
        mesh.add(win);

        const body = new CANNON.Body({
          mass: 260,
          shape: new CANNON.Box(new CANNON.Vec3(bw / 2, bh / 2, bd / 2))
        });
        body.position.set(px, py, pz);
        body.linearDamping = 0.04;
        body.angularDamping = 0.08;
        this.ctx.world.addBody(body);
        body.updateAABB();

        mesh.position.set(px, py, pz);
        this.ctx.dynamics.push({ mesh, body });
      }
    }
  }

  recordDynamicSpawns() {
    for (const d of this.ctx.dynamics) {
      this.dynamicSpawns.push({
        body: d.body,
        pos: d.body.position.clone(),
        quat: d.body.quaternion.clone()
      });
    }
  }

  dropHeavyBlock() {
    if (!this.heavyBlock) return;

    const b = this.heavyBlock.body;
    if (b.sleepState === CANNON.Body.AWAKE) return;

    b.wakeUp();
    this.heavyBlockDropped = true;
  }

  resetObstacles() {
    for (const s of this.dynamicSpawns) {
      s.body.position.copy(s.pos);
      s.body.quaternion.copy(s.quat);
      s.body.velocity.set(0, 0, 0);
      s.body.angularVelocity.set(0, 0, 0);
      s.body.force.set(0, 0, 0);
      s.body.torque.set(0, 0, 0);
      if (s.body.type === CANNON.Body.DYNAMIC) s.body.wakeUp();
    }

    if (this.heavyBlock) {
      const b = this.heavyBlock.body;
      b.position.set(0, 17, 46);
      b.quaternion.set(0, 0, 0, 1);
      b.velocity.set(0, 0, 0);
      b.angularVelocity.set(0, 0, 0);
      b.force.set(0, 0, 0);
      b.torque.set(0, 0, 0);
      b.updateAABB();
      b.sleep();
      this.heavyBlockDropped = false;
    }
  }
}
