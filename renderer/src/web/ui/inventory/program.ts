// Fullscreen triangle. Item samplers use the client's top-left UV origin.
export const vertex = `#version 300 es
out highp vec2 uv;
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
  uv = vec2(corner.x, 1.0 - corner.y);
}`;

export function linkProgram(gl: WebGL2RenderingContext, fragment: string) {
  const program = gl.createProgram()!;
  try {
    for (const [kind, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
      const shader = gl.createShader(kind)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(error ?? "Cannot compile the inventory shader");
      }
      gl.attachShader(program, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "Cannot link inventory shaders");
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  }
}
