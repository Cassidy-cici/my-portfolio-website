/**
 * SplashCursor - 流体鼠标跟随动效 (HTML版)
 * 
 * 使用方式：
 * 1. 在HTML中引入此JS文件：<script src="splash-cursor.js"></script>
 * 2. 在页面加载后调用：SplashCursor.init()
 * 3. 可传入配置覆盖默认值：SplashCursor.init({ SPLAT_RADIUS: 0.3 })
 * 4. 销毁：SplashCursor.destroy()
 */
(function (global) {
  'use strict';

  var animationFrameId = null;
  var isActive = false;
  var canvasEl = null;
  var containerEl = null;

  // 事件处理函数引用，用于清理
  var _handleMouseDown = null;
  var _handleMouseMove = null;
  var _handleTouchStart = null;
  var _handleTouchMove = null;
  var _handleTouchEnd = null;

  function init(userConfig) {
    // 如果已经初始化过，先销毁
    if (isActive) destroy();

    // ============================================================
    // 默认配置 & 用户覆盖
    // ============================================================
    var config = {
      SIM_RESOLUTION: 128,          // 模拟分辨率（影响流体物理计算精度）
      DYE_RESOLUTION: 1440,         // 染料分辨率（影响视觉细节清晰度，越高越精细）
      CAPTURE_RESOLUTION: 512,
      DENSITY_DISSIPATION: 3.5,     // 密度消散速度（越大颜色消失越快，范围建议0.5~5）
      VELOCITY_DISSIPATION: 2,      // 速度消散速度（越大流动停止越快，范围建议0.5~5）
      PRESSURE: 0.1,                // 压力（影响流体扩散行为，范围建议0~1）
      PRESSURE_ITERATIONS: 20,      // 压力迭代次数（越高物理越精确，性能开销越大）
      CURL: 3,                      // 旋度/涡旋强度（越大旋转效果越明显，范围建议0~50）
      SPLAT_RADIUS: 0.2,            // 泼溅半径（控制每次鼠标产生的色块大小，范围建议0.01~1）
      SPLAT_FORCE: 6000,            // 泼溅力度（控制鼠标移动产生的推力大小，范围建议1000~20000）
      SHADING: true,                // 是否启用光影着色效果
      COLOR_UPDATE_SPEED: 10,       // 颜色更新速度（彩虹模式下颜色切换频率）
      BACK_COLOR: { r: 0.5, g: 0, b: 0 },
      TRANSPARENT: true,            // 背景是否透明
      RAINBOW_MODE: false,          // 彩虹模式（true=随机彩色，false=使用固定颜色）
      COLOR: '#6d5dfc',             // 固定颜色（RAINBOW_MODE为false时生效）
      PAUSED: false
    };

    // 合并用户配置
    if (userConfig && typeof userConfig === 'object') {
      for (var key in userConfig) {
        if (userConfig.hasOwnProperty(key) && config.hasOwnProperty(key)) {
          config[key] = userConfig[key];
        }
      }
    }

    isActive = true;

    // ============================================================
    // 创建DOM
    // ============================================================
    containerEl = document.createElement('div');
    containerEl.style.cssText = 'position:fixed;top:0;left:0;z-index:50;pointer-events:none;width:100%;height:100%;';

    canvasEl = document.createElement('canvas');
    canvasEl.id = 'fluid';
    canvasEl.style.cssText = 'width:100vw;height:100vh;display:block;';

    containerEl.appendChild(canvasEl);
    document.body.appendChild(containerEl);

    var canvas = canvasEl;

    // ============================================================
    // Pointer 原型
    // ============================================================
    function pointerPrototype() {
      this.id = -1;
      this.texcoordX = 0;
      this.texcoordY = 0;
      this.prevTexcoordX = 0;
      this.prevTexcoordY = 0;
      this.deltaX = 0;
      this.deltaY = 0;
      this.down = false;
      this.moved = false;
      this.color = [0, 0, 0];
    }

    var pointers = [new pointerPrototype()];

    // ============================================================
    // WebGL 上下文
    // ============================================================
    var webGLContext = getWebGLContext(canvas);
    var gl = webGLContext.gl;
    var ext = webGLContext.ext;

    if (!ext.supportLinearFiltering) {
      config.DYE_RESOLUTION = 256;
      config.SHADING = false;
    }

    function getWebGLContext(canvas) {
      var params = {
        alpha: true,
        depth: false,
        stencil: false,
        antialias: false,
        preserveDrawingBuffer: false
      };
      var gl = canvas.getContext('webgl2', params);
      var isWebGL2 = !!gl;
      if (!isWebGL2) {
        gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);
      }

      var halfFloat;
      var supportLinearFiltering;
      if (isWebGL2) {
        gl.getExtension('EXT_color_buffer_float');
        supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
      } else {
        halfFloat = gl.getExtension('OES_texture_half_float');
        supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
      }
      gl.clearColor(0.0, 0.0, 0.0, 1.0);

      var halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : (halfFloat && halfFloat.HALF_FLOAT_OES);
      var formatRGBA;
      var formatRG;
      var formatR;

      if (isWebGL2) {
        formatRGBA = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType);
        formatRG = getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType);
        formatR = getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType);
      } else {
        formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
        formatRG = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
        formatR = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
      }

      return {
        gl: gl,
        ext: {
          formatRGBA: formatRGBA,
          formatRG: formatRG,
          formatR: formatR,
          halfFloatTexType: halfFloatTexType,
          supportLinearFiltering: supportLinearFiltering
        }
      };
    }

    function getSupportedFormat(gl, internalFormat, format, type) {
      if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
        switch (internalFormat) {
          case gl.R16F:
            return getSupportedFormat(gl, gl.RG16F, gl.RG, type);
          case gl.RG16F:
            return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
          default:
            return null;
        }
      }
      return { internalFormat: internalFormat, format: format };
    }

    function supportRenderTextureFormat(gl, internalFormat, format, type) {
      var texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
      var fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      var status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      return status === gl.FRAMEBUFFER_COMPLETE;
    }

    // ============================================================
    // Material & Program 类
    // ============================================================
    function Material(vertexShader, fragmentShaderSource) {
      this.vertexShader = vertexShader;
      this.fragmentShaderSource = fragmentShaderSource;
      this.programs = [];
      this.activeProgram = null;
      this.uniforms = [];
    }
    Material.prototype.setKeywords = function (keywords) {
      var hash = 0;
      for (var i = 0; i < keywords.length; i++) hash += hashCode(keywords[i]);
      var program = this.programs[hash];
      if (program == null) {
        var fragmentShader = compileShader(gl.FRAGMENT_SHADER, this.fragmentShaderSource, keywords);
        program = createProgram(this.vertexShader, fragmentShader);
        this.programs[hash] = program;
      }
      if (program === this.activeProgram) return;
      this.uniforms = getUniforms(program);
      this.activeProgram = program;
    };
    Material.prototype.bind = function () {
      gl.useProgram(this.activeProgram);
    };

    function ProgramObj(vertexShader, fragmentShader) {
      this.uniforms = {};
      this.program = createProgram(vertexShader, fragmentShader);
      this.uniforms = getUniforms(this.program);
    }
    ProgramObj.prototype.bind = function () {
      gl.useProgram(this.program);
    };

    function createProgram(vertexShader, fragmentShader) {
      var program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.trace(gl.getProgramInfoLog(program));
      }
      return program;
    }

    function getUniforms(program) {
      var uniforms = [];
      var uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (var i = 0; i < uniformCount; i++) {
        var uniformName = gl.getActiveUniform(program, i).name;
        uniforms[uniformName] = gl.getUniformLocation(program, uniformName);
      }
      return uniforms;
    }

    function compileShader(type, source, keywords) {
      source = addKeywords(source, keywords);
      var shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.trace(gl.getShaderInfoLog(shader));
      }
      return shader;
    }

    function addKeywords(source, keywords) {
      if (!keywords) return source;
      var keywordsString = '';
      keywords.forEach(function (keyword) {
        keywordsString += '#define ' + keyword + '\n';
      });
      return keywordsString + source;
    }

    // ============================================================
    // Shaders
    // ============================================================
    var baseVertexShader = compileShader(
      gl.VERTEX_SHADER,
      'precision highp float;\n' +
      'attribute vec2 aPosition;\n' +
      'varying vec2 vUv;\n' +
      'varying vec2 vL;\n' +
      'varying vec2 vR;\n' +
      'varying vec2 vT;\n' +
      'varying vec2 vB;\n' +
      'uniform vec2 texelSize;\n' +
      'void main () {\n' +
      '    vUv = aPosition * 0.5 + 0.5;\n' +
      '    vL = vUv - vec2(texelSize.x, 0.0);\n' +
      '    vR = vUv + vec2(texelSize.x, 0.0);\n' +
      '    vT = vUv + vec2(0.0, texelSize.y);\n' +
      '    vB = vUv - vec2(0.0, texelSize.y);\n' +
      '    gl_Position = vec4(aPosition, 0.0, 1.0);\n' +
      '}'
    );

    var copyShader = compileShader(
      gl.FRAGMENT_SHADER,
      'precision mediump float;\n' +
      'precision mediump sampler2D;\n' +
      'varying highp vec2 vUv;\n' +
      'uniform sampler2D uTexture;\n' +
      'void main () {\n' +
      '    gl_FragColor = texture2D(uTexture, vUv);\n' +
      '}'
    );

    var clearShader = compileShader(
      gl.FRAGMENT_SHADER,
      'precision mediump float;\n' +
      'precision mediump sampler2D;\n' +
      'varying highp vec2 vUv;\n' +
      'uniform sampler2D uTexture;\n' +
      'uniform float value;\n' +
      'void main () {\n' +
      '    gl_FragColor = value * texture2D(uTexture, vUv);\n' +
      '}'
    );

    var displayShaderSource =
      'precision highp float;\n' +
      'precision highp sampler2D;\n' +
      'varying vec2 vUv;\n' +
      'varying vec2 vL;\n' +
      'varying vec2 vR;\n' +
      'varying vec2 vT;\n' +
      'varying vec2 vB;\n' +
      'uniform sampler2D uTexture;\n' +
      'uniform sampler2D uDithering;\n' +
      'uniform vec2 ditherScale;\n' +
      'uniform vec2 texelSize;\n' +
      'vec3 linearToGamma (vec3 color) {\n' +
      '    color = max(color, vec3(0));\n' +
      '    return max(1.055 * pow(color, vec3(0.416666667)) - 0.055, vec3(0));\n' +
      '}\n' +
      'void main () {\n' +
      '    vec3 c = texture2D(uTexture, vUv).rgb;\n' +
      '    #ifdef SHADING\n' +
      '        vec3 lc = texture2D(uTexture, vL).rgb;\n' +
      '        vec3 rc = texture2D(uTexture, vR).rgb;\n' +
      '        vec3 tc = texture2D(uTexture, vT).rgb;\n' +
      '        vec3 bc = texture2D(uTexture, vB).rgb;\n' +
      '        float dx = length(rc) - length(lc);\n' +
      '        float dy = length(tc) - length(bc);\n' +
      '        vec3 n = normalize(vec3(dx, dy, length(texelSize)));\n' +
      '        vec3 l = vec3(0.0, 0.0, 1.0);\n' +
      '        float diffuse = clamp(dot(n, l) + 0.7, 0.7, 1.0);\n' +
      '        c *= diffuse;\n' +
      '    #endif\n' +
      '    float a = max(c.r, max(c.g, c.b));\n' +
      '    gl_FragColor = vec4(c, a);\n' +
      '}';

    var splatShader = compileShader(
      gl.FRAGMENT_SHADER,
      'precision highp float;\n' +
      'precision highp sampler2D;\n' +
      'varying vec2 vUv;\n' +
      'uniform sampler2D uTarget;\n' +
      'uniform float aspectRatio;\n' +
      'uniform vec3 color;\n' +
      'uniform vec2 point;\n' +
      'uniform float radius;\n' +
      'void main () {\n' +
      '    vec2 p = vUv - point.xy;\n' +
      '    p.x *= aspectRatio;\n' +
      '    vec3 splat = exp(-dot(p, p) / radius) * color;\n' +
      '    vec3 base = texture2D(uTarget, vUv).xyz;\n' +
      '    gl_FragColor = vec4(base + splat, 1.0);\n' +
      '}'
    );

    var advectionShader = compileShader(
      gl.FRAGMENT_SHADER,
      'precision highp float;\n' +
      'precision highp sampler2D;\n' +
      'varying vec2 vUv;\n' +
      'uniform sampler2D uVelocity;\n' +
      'uniform sampler2D uSource;\n' +
      'uniform vec2 texelSize;\n' +
      'uniform vec2 dyeTexelSize;\n' +
      'uniform float dt;\n' +
      'uniform float dissipation;\n' +
      'vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {\n' +
      '    vec2 st = uv / tsize - 0.5;\n' +
      '    vec2 iuv = floor(st);\n' +
      '    vec2 fuv = fract(st);\n' +
      '    vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);\n' +
      '    vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);\n' +
      '    vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);\n' +
      '    vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);\n' +
      '    return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);\n' +
      '}\n' +
      'void main () {\n' +
      '    #ifdef MANUAL_FILTERING\n' +
      '        vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;\n' +
      '        vec4 result = bilerp(uSource, coord, dyeTexelSize);\n' +
      '    #else\n' +
      '        vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;\n' +
      '        vec4 result = texture2D(uSource, coord);\n' +
      '    #endif\n' +
      '    float decay = 1.0 + dissipation * dt;\n' +
      '    gl_FragColor = result / decay;\n' +
      '}',
      ext.supportLinearFiltering ? null : ['MANUAL_FILTERING']
    );

    var divergenceShader = compileShader(
      gl.FRAGMENT_SHADER,
      'precision mediump float;\n' +
      'precision mediump sampler2D;\n' +
      'varying highp vec2 vUv;\n' +
      'varying highp vec2 vL;\n' +
      'varying highp vec2 vR;\n' +
      'varying highp vec2 vT;\n' +
      'varying highp vec2 vB;\n' +
      'uniform sampler2D uVelocity;\n' +
      'void main () {\n' +
      '    float L = texture2D(uVelocity, vL).x;\n' +
      '    float R = texture2D(uVelocity, vR).x;\n' +
      '    float T = texture2D(uVelocity, vT).y;\n' +
      '    float B = texture2D(uVelocity, vB).y;\n' +
      '    vec2 C = texture2D(uVelocity, vUv).xy;\n' +
      '    if (vL.x < 0.0) { L = -C.x; }\n' +
      '    if (vR.x > 1.0) { R = -C.x; }\n' +
      '    if (vT.y > 1.0) { T = -C.y; }\n' +
      '    if (vB.y < 0.0) { B = -C.y; }\n' +
      '    float div = 0.5 * (R - L + T - B);\n' +
      '    gl_FragColor = vec4(div, 0.0, 0.0, 1.0);\n' +
      '}'
    );

    var curlShader = compileShader(
      gl.FRAGMENT_SHADER,
      'precision mediump float;\n' +
      'precision mediump sampler2D;\n' +
      'varying highp vec2 vUv;\n' +
      'varying highp vec2 vL;\n' +
      'varying highp vec2 vR;\n' +
      'varying highp vec2 vT;\n' +
      'varying highp vec2 vB;\n' +
      'uniform sampler2D uVelocity;\n' +
      'void main () {\n' +
      '    float L = texture2D(uVelocity, vL).y;\n' +
      '    float R = texture2D(uVelocity, vR).y;\n' +
      '    float T = texture2D(uVelocity, vT).x;\n' +
      '    float B = texture2D(uVelocity, vB).x;\n' +
      '    float vorticity = R - L - T + B;\n' +
      '    gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);\n' +
      '}'
    );

    var vorticityShader = compileShader(
      gl.FRAGMENT_SHADER,
      'precision highp float;\n' +
      'precision highp sampler2D;\n' +
      'varying vec2 vUv;\n' +
      'varying vec2 vL;\n' +
      'varying vec2 vR;\n' +
      'varying vec2 vT;\n' +
      'varying vec2 vB;\n' +
      'uniform sampler2D uVelocity;\n' +
      'uniform sampler2D uCurl;\n' +
      'uniform float curl;\n' +
      'uniform float dt;\n' +
      'void main () {\n' +
      '    float L = texture2D(uCurl, vL).x;\n' +
      '    float R = texture2D(uCurl, vR).x;\n' +
      '    float T = texture2D(uCurl, vT).x;\n' +
      '    float B = texture2D(uCurl, vB).x;\n' +
      '    float C = texture2D(uCurl, vUv).x;\n' +
      '    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));\n' +
      '    force /= length(force) + 0.0001;\n' +
      '    force *= curl * C;\n' +
      '    force.y *= -1.0;\n' +
      '    vec2 velocity = texture2D(uVelocity, vUv).xy;\n' +
      '    velocity += force * dt;\n' +
      '    velocity = min(max(velocity, -1000.0), 1000.0);\n' +
      '    gl_FragColor = vec4(velocity, 0.0, 1.0);\n' +
      '}'
    );

    var pressureShader = compileShader(
      gl.FRAGMENT_SHADER,
      'precision mediump float;\n' +
      'precision mediump sampler2D;\n' +
      'varying highp vec2 vUv;\n' +
      'varying highp vec2 vL;\n' +
      'varying highp vec2 vR;\n' +
      'varying highp vec2 vT;\n' +
      'varying highp vec2 vB;\n' +
      'uniform sampler2D uPressure;\n' +
      'uniform sampler2D uDivergence;\n' +
      'void main () {\n' +
      '    float L = texture2D(uPressure, vL).x;\n' +
      '    float R = texture2D(uPressure, vR).x;\n' +
      '    float T = texture2D(uPressure, vT).x;\n' +
      '    float B = texture2D(uPressure, vB).x;\n' +
      '    float C = texture2D(uPressure, vUv).x;\n' +
      '    float divergence = texture2D(uDivergence, vUv).x;\n' +
      '    float pressure = (L + R + B + T - divergence) * 0.25;\n' +
      '    gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);\n' +
      '}'
    );

    var gradientSubtractShader = compileShader(
      gl.FRAGMENT_SHADER,
      'precision mediump float;\n' +
      'precision mediump sampler2D;\n' +
      'varying highp vec2 vUv;\n' +
      'varying highp vec2 vL;\n' +
      'varying highp vec2 vR;\n' +
      'varying highp vec2 vT;\n' +
      'varying highp vec2 vB;\n' +
      'uniform sampler2D uPressure;\n' +
      'uniform sampler2D uVelocity;\n' +
      'void main () {\n' +
      '    float L = texture2D(uPressure, vL).x;\n' +
      '    float R = texture2D(uPressure, vR).x;\n' +
      '    float T = texture2D(uPressure, vT).x;\n' +
      '    float B = texture2D(uPressure, vB).x;\n' +
      '    vec2 velocity = texture2D(uVelocity, vUv).xy;\n' +
      '    velocity.xy -= vec2(R - L, T - B);\n' +
      '    gl_FragColor = vec4(velocity, 0.0, 1.0);\n' +
      '}'
    );

    // ============================================================
    // Blit (全屏四边形绘制)
    // ============================================================
    var blit = (function () {
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(0);
      return function (target, clear) {
        if (target == null) {
          gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        } else {
          gl.viewport(0, 0, target.width, target.height);
          gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        }
        if (clear) {
          gl.clearColor(0.0, 0.0, 0.0, 1.0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
      };
    })();

    // ============================================================
    // Framebuffer 对象
    // ============================================================
    var dye, velocity, divergence, curlFBO, pressure;

    var copyProgram = new ProgramObj(baseVertexShader, copyShader);
    var clearProgram = new ProgramObj(baseVertexShader, clearShader);
    var splatProgram = new ProgramObj(baseVertexShader, splatShader);
    var advectionProgram = new ProgramObj(baseVertexShader, advectionShader);
    var divergenceProgram = new ProgramObj(baseVertexShader, divergenceShader);
    var curlProgram = new ProgramObj(baseVertexShader, curlShader);
    var vorticityProgram = new ProgramObj(baseVertexShader, vorticityShader);
    var pressureProgram = new ProgramObj(baseVertexShader, pressureShader);
    var gradienSubtractProgram = new ProgramObj(baseVertexShader, gradientSubtractShader);
    var displayMaterial = new Material(baseVertexShader, displayShaderSource);

    function initFramebuffers() {
      var simRes = getResolution(config.SIM_RESOLUTION);
      var dyeRes = getResolution(config.DYE_RESOLUTION);
      var texType = ext.halfFloatTexType;
      var rgba = ext.formatRGBA;
      var rg = ext.formatRG;
      var r = ext.formatR;
      var filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
      gl.disable(gl.BLEND);

      if (!dye)
        dye = createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
      else
        dye = resizeDoubleFBO(dye, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);

      if (!velocity)
        velocity = createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
      else
        velocity = resizeDoubleFBO(velocity, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);

      divergence = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
      curlFBO = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
      pressure = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    }

    function createFBO(w, h, internalFormat, format, type, param) {
      gl.activeTexture(gl.TEXTURE0);
      var texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

      var fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT);

      var texelSizeX = 1.0 / w;
      var texelSizeY = 1.0 / h;
      return {
        texture: texture,
        fbo: fbo,
        width: w,
        height: h,
        texelSizeX: texelSizeX,
        texelSizeY: texelSizeY,
        attach: function (id) {
          gl.activeTexture(gl.TEXTURE0 + id);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          return id;
        }
      };
    }

    function createDoubleFBO(w, h, internalFormat, format, type, param) {
      var fbo1 = createFBO(w, h, internalFormat, format, type, param);
      var fbo2 = createFBO(w, h, internalFormat, format, type, param);
      return {
        width: w,
        height: h,
        texelSizeX: fbo1.texelSizeX,
        texelSizeY: fbo1.texelSizeY,
        get read() { return fbo1; },
        set read(value) { fbo1 = value; },
        get write() { return fbo2; },
        set write(value) { fbo2 = value; },
        swap: function () {
          var temp = fbo1;
          fbo1 = fbo2;
          fbo2 = temp;
        }
      };
    }

    function resizeFBO(target, w, h, internalFormat, format, type, param) {
      var newFBO = createFBO(w, h, internalFormat, format, type, param);
      copyProgram.bind();
      gl.uniform1i(copyProgram.uniforms.uTexture, target.attach(0));
      blit(newFBO);
      return newFBO;
    }

    function resizeDoubleFBO(target, w, h, internalFormat, format, type, param) {
      if (target.width === w && target.height === h) return target;
      target.read = resizeFBO(target.read, w, h, internalFormat, format, type, param);
      target.write = createFBO(w, h, internalFormat, format, type, param);
      target.width = w;
      target.height = h;
      target.texelSizeX = 1.0 / w;
      target.texelSizeY = 1.0 / h;
      return target;
    }

    // ============================================================
    // 关键字 & 初始化
    // ============================================================
    function updateKeywords() {
      var displayKeywords = [];
      if (config.SHADING) displayKeywords.push('SHADING');
      displayMaterial.setKeywords(displayKeywords);
    }

    updateKeywords();
    initFramebuffers();

    var lastUpdateTime = Date.now();
    var colorUpdateTimer = 0.0;

    // ============================================================
    // 主循环
    // ============================================================
    function updateFrame() {
      if (!isActive) return;
      var dt = calcDeltaTime();
      if (resizeCanvas()) initFramebuffers();
      updateColors(dt);
      applyInputs();
      step(dt);
      render(null);
      animationFrameId = requestAnimationFrame(updateFrame);
    }

    function calcDeltaTime() {
      var now = Date.now();
      var dt = (now - lastUpdateTime) / 1000;
      dt = Math.min(dt, 0.016666);
      lastUpdateTime = now;
      return dt;
    }

    function resizeCanvas() {
      var width = scaleByPixelRatio(canvas.clientWidth);
      var height = scaleByPixelRatio(canvas.clientHeight);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        return true;
      }
      return false;
    }

    function updateColors(dt) {
      colorUpdateTimer += dt * config.COLOR_UPDATE_SPEED;
      if (colorUpdateTimer >= 1) {
        colorUpdateTimer = wrap(colorUpdateTimer, 0, 1);
        pointers.forEach(function (p) {
          p.color = generateColor();
        });
      }
    }

    function applyInputs() {
      pointers.forEach(function (p) {
        if (p.moved) {
          p.moved = false;
          splatPointer(p);
        }
      });
    }

    function step(dt) {
      gl.disable(gl.BLEND);

      curlProgram.bind();
      gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
      blit(curlFBO);

      vorticityProgram.bind();
      gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
      gl.uniform1i(vorticityProgram.uniforms.uCurl, curlFBO.attach(1));
      gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
      gl.uniform1f(vorticityProgram.uniforms.dt, dt);
      blit(velocity.write);
      velocity.swap();

      divergenceProgram.bind();
      gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
      blit(divergence);

      clearProgram.bind();
      gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
      gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
      blit(pressure.write);
      pressure.swap();

      pressureProgram.bind();
      gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
      for (var i = 0; i < config.PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
        blit(pressure.write);
        pressure.swap();
      }

      gradienSubtractProgram.bind();
      gl.uniform2f(gradienSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(gradienSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
      gl.uniform1i(gradienSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
      blit(velocity.write);
      velocity.swap();

      advectionProgram.bind();
      gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      if (!ext.supportLinearFiltering)
        gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
      var velocityId = velocity.read.attach(0);
      gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId);
      gl.uniform1i(advectionProgram.uniforms.uSource, velocityId);
      gl.uniform1f(advectionProgram.uniforms.dt, dt);
      gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
      blit(velocity.write);
      velocity.swap();

      if (!ext.supportLinearFiltering)
        gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
      gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
      gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
      gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
      blit(dye.write);
      dye.swap();
    }

    function render(target) {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.BLEND);
      drawDisplay(target);
    }

    function drawDisplay(target) {
      var width = target == null ? gl.drawingBufferWidth : target.width;
      var height = target == null ? gl.drawingBufferHeight : target.height;
      displayMaterial.bind();
      if (config.SHADING) gl.uniform2f(displayMaterial.uniforms.texelSize, 1.0 / width, 1.0 / height);
      gl.uniform1i(displayMaterial.uniforms.uTexture, dye.read.attach(0));
      blit(target);
    }

    // ============================================================
    // Splat 相关
    // ============================================================
    function splatPointer(pointer) {
      var dx = pointer.deltaX * config.SPLAT_FORCE;
      var dy = pointer.deltaY * config.SPLAT_FORCE;
      splat(pointer.texcoordX, pointer.texcoordY, dx, dy, pointer.color);
    }

    function clickSplat(pointer) {
      var color = generateColor();
      color.r *= 10.0;
      color.g *= 10.0;
      color.b *= 10.0;
      var dx = 10 * (Math.random() - 0.5);
      var dy = 30 * (Math.random() - 0.5);
      splat(pointer.texcoordX, pointer.texcoordY, dx, dy, color);
    }

    function splat(x, y, dx, dy, color) {
      splatProgram.bind();
      gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
      gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
      gl.uniform2f(splatProgram.uniforms.point, x, y);
      gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0);
      gl.uniform1f(splatProgram.uniforms.radius, correctRadius(config.SPLAT_RADIUS / 100.0));
      blit(velocity.write);
      velocity.swap();

      gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
      gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
      blit(dye.write);
      dye.swap();
    }

    function correctRadius(radius) {
      var aspectRatio = canvas.width / canvas.height;
      if (aspectRatio > 1) radius *= aspectRatio;
      return radius;
    }

    // ============================================================
    // Pointer 数据更新
    // ============================================================
    function updatePointerDownData(pointer, id, posX, posY) {
      pointer.id = id;
      pointer.down = true;
      pointer.moved = false;
      pointer.texcoordX = posX / canvas.width;
      pointer.texcoordY = 1.0 - posY / canvas.height;
      pointer.prevTexcoordX = pointer.texcoordX;
      pointer.prevTexcoordY = pointer.texcoordY;
      pointer.deltaX = 0;
      pointer.deltaY = 0;
      pointer.color = generateColor();
    }

    function updatePointerMoveData(pointer, posX, posY, color) {
      pointer.prevTexcoordX = pointer.texcoordX;
      pointer.prevTexcoordY = pointer.texcoordY;
      pointer.texcoordX = posX / canvas.width;
      pointer.texcoordY = 1.0 - posY / canvas.height;
      pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
      pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
      pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
      pointer.color = color;
    }

    function updatePointerUpData(pointer) {
      pointer.down = false;
    }

    function correctDeltaX(delta) {
      var aspectRatio = canvas.width / canvas.height;
      if (aspectRatio < 1) delta *= aspectRatio;
      return delta;
    }

    function correctDeltaY(delta) {
      var aspectRatio = canvas.width / canvas.height;
      if (aspectRatio > 1) delta /= aspectRatio;
      return delta;
    }

    // ============================================================
    // 颜色工具
    // ============================================================
    function hexToRGB(hex) {
      var val = hex.replace('#', '');
      if (val.length === 3) val = val[0] + val[0] + val[1] + val[1] + val[2] + val[2];
      var r = parseInt(val.slice(0, 2), 16) / 255;
      var g = parseInt(val.slice(2, 4), 16) / 255;
      var b = parseInt(val.slice(4, 6), 16) / 255;
      return { r: r * 0.15, g: g * 0.15, b: b * 0.15 };
    }

    function generateColor() {
      if (!config.RAINBOW_MODE) {
        return hexToRGB(config.COLOR);
      }
      var c = HSVtoRGB(Math.random(), 1.0, 1.0);
      c.r *= 0.15;
      c.g *= 0.15;
      c.b *= 0.15;
      return c;
    }

    function HSVtoRGB(h, s, v) {
      var r, g, b, i, f, p, q, t;
      i = Math.floor(h * 6);
      f = h * 6 - i;
      p = v * (1 - s);
      q = v * (1 - f * s);
      t = v * (1 - (1 - f) * s);
      switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
      }
      return { r: r, g: g, b: b };
    }

    // ============================================================
    // 工具函数
    // ============================================================
    function wrap(value, min, max) {
      var range = max - min;
      if (range === 0) return min;
      return ((value - min) % range) + min;
    }

    function getResolution(resolution) {
      var aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
      if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;
      var min = Math.round(resolution);
      var max = Math.round(resolution * aspectRatio);
      if (gl.drawingBufferWidth > gl.drawingBufferHeight) return { width: max, height: min };
      else return { width: min, height: max };
    }

    function scaleByPixelRatio(input) {
      var pixelRatio = window.devicePixelRatio || 1;
      return Math.floor(input * pixelRatio);
    }

    function hashCode(s) {
      if (s.length === 0) return 0;
      var hash = 0;
      for (var i = 0; i < s.length; i++) {
        hash = (hash << 5) - hash + s.charCodeAt(i);
        hash |= 0;
      }
      return hash;
    }

    // ============================================================
    // 事件监听
    // ============================================================
    var firstMouseMoveHandled = false;

    _handleMouseDown = function (e) {
      var pointer = pointers[0];
      var posX = scaleByPixelRatio(e.clientX);
      var posY = scaleByPixelRatio(e.clientY);
      updatePointerDownData(pointer, -1, posX, posY);
      clickSplat(pointer);
    };

    _handleMouseMove = function (e) {
      var pointer = pointers[0];
      var posX = scaleByPixelRatio(e.clientX);
      var posY = scaleByPixelRatio(e.clientY);
      if (!firstMouseMoveHandled) {
        var color = generateColor();
        updatePointerMoveData(pointer, posX, posY, color);
        firstMouseMoveHandled = true;
      } else {
        updatePointerMoveData(pointer, posX, posY, pointer.color);
      }
    };

    _handleTouchStart = function (e) {
      var touches = e.targetTouches;
      var pointer = pointers[0];
      for (var i = 0; i < touches.length; i++) {
        var posX = scaleByPixelRatio(touches[i].clientX);
        var posY = scaleByPixelRatio(touches[i].clientY);
        updatePointerDownData(pointer, touches[i].identifier, posX, posY);
      }
    };

    _handleTouchMove = function (e) {
      var touches = e.targetTouches;
      var pointer = pointers[0];
      for (var i = 0; i < touches.length; i++) {
        var posX = scaleByPixelRatio(touches[i].clientX);
        var posY = scaleByPixelRatio(touches[i].clientY);
        updatePointerMoveData(pointer, posX, posY, pointer.color);
      }
    };

    _handleTouchEnd = function (e) {
      var touches = e.changedTouches;
      var pointer = pointers[0];
      for (var i = 0; i < touches.length; i++) {
        updatePointerUpData(pointer);
      }
    };

    window.addEventListener('mousedown', _handleMouseDown);
    window.addEventListener('mousemove', _handleMouseMove);
    window.addEventListener('touchstart', _handleTouchStart);
    window.addEventListener('touchmove', _handleTouchMove, false);
    window.addEventListener('touchend', _handleTouchEnd);

    // 启动动画
    updateFrame();
  }

  // ============================================================
  // 销毁
  // ============================================================
  function destroy() {
    isActive = false;

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    if (_handleMouseDown) window.removeEventListener('mousedown', _handleMouseDown);
    if (_handleMouseMove) window.removeEventListener('mousemove', _handleMouseMove);
    if (_handleTouchStart) window.removeEventListener('touchstart', _handleTouchStart);
    if (_handleTouchMove) window.removeEventListener('touchmove', _handleTouchMove);
    if (_handleTouchEnd) window.removeEventListener('touchend', _handleTouchEnd);

    _handleMouseDown = null;
    _handleMouseMove = null;
    _handleTouchStart = null;
    _handleTouchMove = null;
    _handleTouchEnd = null;

    if (containerEl && containerEl.parentNode) {
      containerEl.parentNode.removeChild(containerEl);
    }
    containerEl = null;
    canvasEl = null;
  }

  // ============================================================
  // 暴露全局API
  // ============================================================
  global.SplashCursor = {
    init: init,
    destroy: destroy
  };

})(window);
