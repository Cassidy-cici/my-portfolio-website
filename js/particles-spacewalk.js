/* Particles.js — 纯原生 WebGL 版本，1:1 复刻 React+OGL 原版 */

(function () {
  'use strict';

  /* ============ 工具函数 ============ */
  function hexToRgb(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) {
      hex = hex.split('').map(function (c) { return c + c; }).join('');
    }
    var int = parseInt(hex, 16);
    return [
      ((int >> 16) & 255) / 255,
      ((int >> 8) & 255) / 255,
      (int & 255) / 255
    ];
  }

  /* ============ 着色器源码（与原版完全一致） ============ */
  var vertexSource = [
    'attribute vec3 aPosition;',
    'attribute vec4 aRandom;',
    'attribute vec3 aColor;',
    '',
    'uniform mat4 uProjectionMatrix;',
    'uniform mat4 uViewMatrix;',
    'uniform mat4 uModelMatrix;',
    'uniform float uTime;',
    'uniform float uSpread;',
    'uniform float uBaseSize;',
    'uniform float uSizeRandomness;',
    '',
    'varying vec4 vRandom;',
    'varying vec3 vColor;',
    '',
    'void main() {',
    '  vRandom = aRandom;',
    '  vColor  = aColor;',
    '',
    '  vec3 pos = aPosition * uSpread;',
    '  pos.z *= 10.0;',
    '',
    '  vec4 mPos = uModelMatrix * vec4(pos, 1.0);',
    '  float t = uTime;',
    '  mPos.x += sin(t * aRandom.z + 6.28 * aRandom.w) * mix(0.1, 1.5, aRandom.x);',
    '  mPos.y += sin(t * aRandom.y + 6.28 * aRandom.x) * mix(0.1, 1.5, aRandom.w);',
    '  mPos.z += sin(t * aRandom.w + 6.28 * aRandom.y) * mix(0.1, 1.5, aRandom.z);',
    '',
    '  vec4 mvPos = uViewMatrix * mPos;',
    '',
    '  if (uSizeRandomness == 0.0) {',
    '    gl_PointSize = uBaseSize;',
    '  } else {',
    '    gl_PointSize = (uBaseSize * (1.0 + uSizeRandomness * (aRandom.x - 0.5))) / length(mvPos.xyz);',
    '  }',
    '',
    '  gl_Position = projectionMatrix_mul(mvPos);',
    '}'
  ].join('\n');

  // 上面用了占位，下面直接用模板字符串更清晰，兼容 ES5 时用拼接
  // 重新定义，确保正确：
  vertexSource =
    'attribute vec3 aPosition;\n' +
    'attribute vec4 aRandom;\n' +
    'attribute vec3 aColor;\n' +
    'uniform mat4 uProjectionMatrix;\n' +
    'uniform mat4 uViewMatrix;\n' +
    'uniform mat4 uModelMatrix;\n' +
    'uniform float uTime;\n' +
    'uniform float uSpread;\n' +
    'uniform float uBaseSize;\n' +
    'uniform float uSizeRandomness;\n' +
    'varying vec4 vRandom;\n' +
    'varying vec3 vColor;\n' +
    'void main() {\n' +
    '  vRandom = aRandom;\n' +
    '  vColor  = aColor;\n' +
    '  vec3 pos = aPosition * uSpread;\n' +
    '  pos.z *= 10.0;\n' +
    '  vec4 mPos = uModelMatrix * vec4(pos, 1.0);\n' +
    '  float t = uTime;\n' +
    '  mPos.x += sin(t * aRandom.z + 6.28 * aRandom.w) * mix(0.1, 1.5, aRandom.x);\n' +
    '  mPos.y += sin(t * aRandom.y + 6.28 * aRandom.x) * mix(0.1, 1.5, aRandom.w);\n' +
    '  mPos.z += sin(t * aRandom.w + 6.28 * aRandom.y) * mix(0.1, 1.5, aRandom.z);\n' +
    '  vec4 mvPos = uViewMatrix * mPos;\n' +
    '  if (uSizeRandomness == 0.0) {\n' +
    '    gl_PointSize = uBaseSize;\n' +
    '  } else {\n' +
    '    gl_PointSize = (uBaseSize * (1.0 + uSizeRandomness * (aRandom.x - 0.5))) / length(mvPos.xyz);\n' +
    '  }\n' +
    '  gl_Position = uProjectionMatrix * mvPos;\n' +
    '}\n';

  var fragmentSource =
    'precision highp float;\n' +
    'uniform float uTime;\n' +
    'uniform float uAlphaParticles;\n' +
    'varying vec4 vRandom;\n' +
    'varying vec3 vColor;\n' +
    'void main() {\n' +
    '  vec2 uv = gl_PointCoord.xy;\n' +
    '  float d = length(uv - vec2(0.5));\n' +
    '  if (uAlphaParticles < 0.5) {\n' +
    '    if (d > 0.5) discard;\n' +
    '    gl_FragColor = vec4(vColor + 0.2 * sin(uv.yxx + uTime + vRandom.y * 6.28), 1.0);\n' +
    '  } else {\n' +
    '    float circle = smoothstep(0.5, 0.4, d) * 0.8;\n' +
    '    gl_FragColor = vec4(vColor + 0.2 * sin(uv.yxx + uTime + vRandom.y * 6.28), circle);\n' +
    '  }\n' +
    '}\n';

  /* ============ 矩阵工具（替代 OGL 的 Camera / modelMatrix） ============ */
  function mat4_create() {
    var m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  }

  function mat4_perspective(out, fovRad, aspect, near, far) {
    var f = 1.0 / Math.tan(fovRad / 2);
    var nf = 1 / (near - far);
    out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
    out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
    return out;
  }

  function mat4_lookAt(out, eye, center, up) {
    var ex = eye[0], ey = eye[1], ez = eye[2];
    var cx = center[0], cy = center[1], cz = center[2];
    var ux = up[0], uy = up[1], uz = up[2];
    var zx = ex - cx, zy = ey - cy, zz = ez - cz;
    var len = 1 / Math.sqrt(zx * zx + zy * zy + zz * zz);
    zx *= len; zy *= len; zz *= len;
    var xx = uy * zz - uz * zy;
    var xy = uz * zx - ux * zz;
    var xz = ux * zy - uy * zx;
    len = 1 / Math.sqrt(xx * xx + xy * xy + xz * xz);
    xx *= len; xy *= len; xz *= len;
    var yx = zy * xz - zz * xy;
    var yy = zz * xx - zx * xz;
    var yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * ex + xy * ey + xz * ez);
    out[13] = -(yx * ex + yy * ey + yz * ez);
    out[14] = -(zx * ex + zy * ey + zz * ez);
    out[15] = 1;
    return out;
  }

  function mat4_identity(out) {
    for (var i = 0; i < 16; i++) out[i] = 0;
    out[0] = out[5] = out[10] = out[15] = 1;
    return out;
  }

  function mat4_translate(out, a, v) {
    var x = v[0], y = v[1], z = v[2];
    out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3];
    out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7];
    out[8] = a[8]; out[9] = a[9]; out[10] = a[10]; out[11] = a[11];
    out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
    out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
    out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
    out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    return out;
  }

  function mat4_rotateX(out, a, rad) {
    var s = Math.sin(rad), c = Math.cos(rad);
    var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3];
    out[4] = a10 * c + a20 * s; out[5] = a11 * c + a21 * s;
    out[6] = a12 * c + a22 * s; out[7] = a13 * c + a23 * s;
    out[8] = a20 * c - a10 * s; out[9] = a21 * c - a11 * s;
    out[10] = a22 * c - a12 * s; out[11] = a23 * c - a13 * s;
    out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    return out;
  }

  function mat4_rotateY(out, a, rad) {
    var s = Math.sin(rad), c = Math.cos(rad);
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7];
    out[0] = a00 * c - a20 * s; out[1] = a01 * c - a21 * s;
    out[2] = a02 * c - a22 * s; out[3] = a03 * c - a23 * s;
    out[8] = a00 * s + a20 * c; out[9] = a01 * s + a21 * c;
    out[10] = a02 * s + a22 * c; out[11] = a03 * s + a23 * c;
    out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    return out;
  }

  function mat4_rotateZ(out, a, rad) {
    var s = Math.sin(rad), c = Math.cos(rad);
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    out[0] = a00 * c + a10 * s; out[1] = a01 * c + a11 * s;
    out[2] = a02 * c + a12 * s; out[3] = a03 * c + a13 * s;
    out[4] = a10 * c - a00 * s; out[5] = a11 * c - a01 * s;
    out[6] = a12 * c - a02 * s; out[7] = a13 * c - a03 * s;
    out[8] = a[8]; out[9] = a[9]; out[10] = a[10]; out[11] = a[11];
    out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    return out;
  }

  /* ============ 编译着色器 ============ */
  function compileShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(gl, vsSrc, fsSrc) {
    var vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
    var fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }

  /* ============ 主类 ============ */
  window.ParticlesEffect = function (container, options) {
    options = options || {};

    // 参数（与原版默认值一致）
    var particleCount      = options.particleCount      !== undefined ? options.particleCount      : 200;
    var particleSpread     = options.particleSpread     !== undefined ? options.particleSpread     : 10;
    var speed              = options.speed              !== undefined ? options.speed              : 0.1;
    var particleColors     = options.particleColors     && options.particleColors.length > 0 ? options.particleColors : ['#ffffff', '#ffffff', '#ffffff'];
    var moveParticlesOnHover = !!options.moveParticlesOnHover;
    var particleHoverFactor= options.particleHoverFactor!== undefined ? options.particleHoverFactor: 1;
    var alphaParticles     = !!options.alphaParticles;
    var particleBaseSize   = options.particleBaseSize   !== undefined ? options.particleBaseSize   : 100;
    var sizeRandomness     = options.sizeRandomness     !== undefined ? options.sizeRandomness     : 1;
    var cameraDistance     = options.cameraDistance      !== undefined ? options.cameraDistance      : 20;
    var disableRotation    = !!options.disableRotation;
    var pixelRatio         = options.pixelRatio          !== undefined ? options.pixelRatio          : 1;

    // 容器
    if (typeof container === 'string') {
      container = document.querySelector(container);
    }
    if (!container) { console.error('ParticlesEffect: container not found'); return; }
    container.classList.add('particles-container');

    // Canvas & WebGL
    var canvas = document.createElement('canvas');
    container.appendChild(canvas);
    var gl = canvas.getContext('webgl', { alpha: true, depth: false, antialias: false });
    if (!gl) { console.error('WebGL not supported'); return; }

    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Resize
    function resize() {
      var w = container.clientWidth;
      var h = container.clientHeight;
      canvas.width  = w * pixelRatio;
      canvas.height = h * pixelRatio;
      canvas.style.width  = w + 'px';
      canvas.style.height = h + 'px';
      gl.viewport(0, 0, canvas.width, canvas.height);
      mat4_perspective(projMatrix, fovRad, canvas.width / canvas.height, 0.1, 100);
    }

    // Camera
    var fovRad = 15 * Math.PI / 180;
    var projMatrix = mat4_create();
    var viewMatrix = mat4_create();
    mat4_lookAt(viewMatrix, [0, 0, cameraDistance], [0, 0, 0], [0, 1, 0]);

    // Shader program
    var prog = createProgram(gl, vertexSource, fragmentSource);
    gl.useProgram(prog);

    // Attributes
    var aPosition = gl.getAttribLocation(prog, 'aPosition');
    var aRandom   = gl.getAttribLocation(prog, 'aRandom');
    var aColor    = gl.getAttribLocation(prog, 'aColor');

    // Uniforms
    var uProjectionMatrix = gl.getUniformLocation(prog, 'uProjectionMatrix');
    var uViewMatrix       = gl.getUniformLocation(prog, 'uViewMatrix');
    var uModelMatrix      = gl.getUniformLocation(prog, 'uModelMatrix');
    var uTime             = gl.getUniformLocation(prog, 'uTime');
    var uSpread           = gl.getUniformLocation(prog, 'uSpread');
    var uBaseSize         = gl.getUniformLocation(prog, 'uBaseSize');
    var uSizeRandomness   = gl.getUniformLocation(prog, 'uSizeRandomness');
    var uAlphaParticles   = gl.getUniformLocation(prog, 'uAlphaParticles');

    // 生成粒子数据（与原版相同的球体均匀采样）
    var count = particleCount;
    var positions = new Float32Array(count * 3);
    var randoms   = new Float32Array(count * 4);
    var colors    = new Float32Array(count * 3);

    for (var i = 0; i < count; i++) {
      var x, y, z, len;
      do {
        x = Math.random() * 2 - 1;
        y = Math.random() * 2 - 1;
        z = Math.random() * 2 - 1;
        len = x * x + y * y + z * z;
      } while (len > 1 || len === 0);
      var r = Math.cbrt(Math.random());
      positions[i * 3]     = x * r;
      positions[i * 3 + 1] = y * r;
      positions[i * 3 + 2] = z * r;
      randoms[i * 4]     = Math.random();
      randoms[i * 4 + 1] = Math.random();
      randoms[i * 4 + 2] = Math.random();
      randoms[i * 4 + 3] = Math.random();
      var col = hexToRgb(particleColors[Math.floor(Math.random() * particleColors.length)]);
      colors[i * 3]     = col[0];
      colors[i * 3 + 1] = col[1];
      colors[i * 3 + 2] = col[2];
    }

    // 创建 Buffer
    function createBuffer(data, attrib, size) {
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(attrib);
      gl.vertexAttribPointer(attrib, size, gl.FLOAT, false, 0, 0);
      return buf;
    }

    createBuffer(positions, aPosition, 3);
    createBuffer(randoms, aRandom, 4);
    createBuffer(colors, aColor, 3);

    // 设置静态 Uniform
    gl.uniform1f(uSpread, particleSpread);
    gl.uniform1f(uBaseSize, particleBaseSize * pixelRatio);
    gl.uniform1f(uSizeRandomness, sizeRandomness);
    gl.uniform1f(uAlphaParticles, alphaParticles ? 1.0 : 0.0);

    // 初始化矩阵 & resize
    resize();
    window.addEventListener('resize', resize, false);

    // 鼠标
    var mouse = { x: 0, y: 0 };
    function handleMouseMove(e) {
      var rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    }
    if (moveParticlesOnHover) {
      container.addEventListener('mousemove', handleMouseMove);
    }

    // 动画循环
    var modelMatrix = mat4_create();
    var lastTime = performance.now();
    var elapsed = 0;
    var rotZ = 0;
    var animId;

    function update(t) {
      animId = requestAnimationFrame(update);
      var delta = t - lastTime;
      lastTime = t;
      elapsed += delta * speed;

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);

      // Model matrix = translate + rotate（复刻原版 particles.position / particles.rotation）
      mat4_identity(modelMatrix);

      // position（鼠标偏移）
      if (moveParticlesOnHover) {
        mat4_translate(modelMatrix, modelMatrix, [-mouse.x * particleHoverFactor, -mouse.y * particleHoverFactor, 0]);
      }

      // rotation
      if (!disableRotation) {
        mat4_rotateX(modelMatrix, modelMatrix, Math.sin(elapsed * 0.0002) * 0.1);
        mat4_rotateY(modelMatrix, modelMatrix, Math.cos(elapsed * 0.0005) * 0.15);
        rotZ += 0.01 * speed;
        mat4_rotateZ(modelMatrix, modelMatrix, rotZ);
      }

      // Upload uniforms
      gl.uniformMatrix4fv(uProjectionMatrix, false, projMatrix);
      gl.uniformMatrix4fv(uViewMatrix, false, viewMatrix);
      gl.uniformMatrix4fv(uModelMatrix, false, modelMatrix);
      gl.uniform1f(uTime, elapsed * 0.001);

      gl.drawArrays(gl.POINTS, 0, count);
    }

    animId = requestAnimationFrame(update);

    // 返回销毁方法
    this.destroy = function () {
      window.removeEventListener('resize', resize);
      if (moveParticlesOnHover) {
        container.removeEventListener('mousemove', handleMouseMove);
      }
      cancelAnimationFrame(animId);
      if (container.contains(canvas)) {
        container.removeChild(canvas);
      }
    };
  };

})();
