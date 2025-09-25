import { resizeAspectRatio, setupText, updateText } from '../util/util.js';
import { Shader, readShaderFile } from '../util/shader.js';

const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl2');
const keycurr = {}; //event
let shader;   // shader program
let vao;      // vertex array object
let verticalFlip = 1.0; // 1.0 for normal, -1.0 for vertical flip
let textOverlay; // for text output third line (see util.js)


function initWebGL() {
    if (!gl) {
        console.error('WebGL 2 is not supported by your browser.');
        return false;
    }
    //600
    canvas.width = 600;
    canvas.height = 600;

    resizeAspectRatio(gl, canvas);

    // Initialize WebGL settings
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    
    return true;
}

async function initShader() {
    const vertexShaderSource = await readShaderFile('shVert.glsl');
    const fragmentShaderSource = await readShaderFile('shFrag.glsl');
    shader = new Shader(gl, vertexShaderSource, fragmentShaderSource);
}

//hint
window.addEventListener('keydown', (event) => {
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (keys.includes(event.key)){
        keycurr[event.key] = true;
        event.preventDefault();
    }

        });
window.addEventListener('keyup', (event) => {
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (keys.includes(event.key)){
        keycurr[event.key] = false;
        event.preventDefault();
    }
        });


function setupBuffers() {
    const vertices = new Float32Array([
        -0.1, -0.1, 0.0,   // bl
        0.1, -0.1, 0.0,   // br
        0.1,  0.1, 0.0,   // ur
        -0.1,  0.1, 0.0    // ul
    ]);

    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    shader.setAttribPointer('aPos', 3, gl.FLOAT, false, 0, 0);
}

let coorx = 0.0, coory = 0.0 ;

function render() {
    if (keycurr['ArrowUp']) coory += 0.01;
    if (keycurr['ArrowDown']) coory -= 0.01;
    if (keycurr['ArrowLeft']) coorx -= 0.01;
    if (keycurr['ArrowRight']) coorx += 0.01;
    //range out
    coorx = Math.max(-1.0, Math.min(1.0, coorx) );
    coory = Math.max(-1.0, Math.min(1.0, coory) );

    // WebGL 그리기
    gl.clear(gl.COLOR_BUFFER_BIT);

    //rectangle red
    let color = [1.0, 0.0, 0.0, 1.0];
    
    shader.setVec4("uColor", color);
    shader.setFloat("verticalFlip", verticalFlip);
    shader.setVec2("uOffset", [coorx, coory]);
    
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    requestAnimationFrame(() => render());
} 

async function main() {
    try {

        // WebGL 초기화
        if (!initWebGL()) {
            throw new Error('WebGL 초기화 실패');
        }

        // 셰이더 초기화
        await initShader();
        
        // 나머지 초기화
        shader.use();
        setupBuffers(shader);
        
        textOverlay = setupText(canvas, "Use arrow keys to move the rectangle", 1);
        
        // 렌더링 시작
        render();

        return true;

    } catch (error) {
        console.error('Failed to initialize program:', error);
        alert('프로그램 초기화에 실패했습니다.');
        return false;
    }
}

// call main function
main().then(success => {
    if (!success) {
        console.log('프로그램을 종료합니다.');
        return;
    }
}).catch(error => {
    console.error('프로그램 실행 중 오류 발생:', error);
});
