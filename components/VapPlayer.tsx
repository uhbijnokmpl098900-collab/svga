import React, { useEffect, useRef, useState } from 'react';

interface VapPlayerProps {
    src: string;
    width?: number;
    height?: number;
    className?: string;
}

export const VapPlayer: React.FC<VapPlayerProps> = ({ src, width, height, className }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const requestRef = useRef<number>();
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;

        const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
        if (!gl) return;

        // Shaders
        const vsSource = `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            varying vec2 v_texCoord;
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
                v_texCoord = a_texCoord;
            }
        `;

        // Fragment Shader for Side-by-Side (Left: Alpha, Right: RGB)
        const fsSource = `
            precision mediump float;
            uniform sampler2D u_image;
            varying vec2 v_texCoord;
            void main() {
                // RGB is on the Right (0.5 to 1.0)
                vec2 rgbUV = vec2(v_texCoord.x * 0.5 + 0.5, v_texCoord.y);
                // Alpha is on the Left (0.0 to 0.5)
                vec2 alphaUV = vec2(v_texCoord.x * 0.5, v_texCoord.y);
                
                vec4 color = texture2D(u_image, rgbUV);
                vec4 alpha = texture2D(u_image, alphaUV);
                
                gl_FragColor = vec4(color.rgb, alpha.r);
            }
        `;

        // Compile Shaders
        const createShader = (gl: WebGLRenderingContext, type: number, source: string) => {
            const shader = gl.createShader(type);
            if (!shader) return null;
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error(gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        };

        const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
        const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
        if (!vertexShader || !fragmentShader) return;

        const program = gl.createProgram();
        if (!program) return;
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        gl.useProgram(program);

        // Buffers
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1.0, -1.0,
             1.0, -1.0,
            -1.0,  1.0,
            -1.0,  1.0,
             1.0, -1.0,
             1.0,  1.0,
        ]), gl.STATIC_DRAW);

        const texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        // Flip Y for WebGL texture coordinates usually
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            0.0, 1.0,
            1.0, 1.0,
            0.0, 0.0,
            0.0, 0.0,
            1.0, 1.0,
            1.0, 0.0,
        ]), gl.STATIC_DRAW);

        // Attributes & Uniforms
        const positionLocation = gl.getAttribLocation(program, "a_position");
        const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");
        const imageLocation = gl.getUniformLocation(program, "u_image");

        gl.enableVertexAttribArray(positionLocation);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        gl.enableVertexAttribArray(texCoordLocation);
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

        // Texture
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        const render = () => {
            if (video.readyState >= video.HAVE_CURRENT_DATA) {
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
            }
            requestRef.current = requestAnimationFrame(render);
        };

        video.addEventListener('play', () => {
            setIsPlaying(true);
            render();
        });

        video.addEventListener('pause', () => {
            setIsPlaying(false);
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        });

        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [src]);

    return (
        <div className={`relative ${className}`}>
            <video 
                ref={videoRef} 
                src={src} 
                className="hidden" 
                playsInline 
                loop 
                muted // Muted for autoplay usually, but we want audio. 
                // If we want audio, we should show controls or handle it.
                // Let's expose controls on the container or just use video controls?
                // We can't use video controls because the video is hidden.
                // We need custom controls or just click to play.
                // For now, let's auto-play muted or let user click.
            />
            <canvas 
                ref={canvasRef} 
                width={width} 
                height={height} 
                className="w-full h-full object-contain cursor-pointer"
                onClick={() => {
                    if (videoRef.current) {
                        if (videoRef.current.paused) {
                            videoRef.current.play();
                        } else {
                            videoRef.current.pause();
                        }
                    }
                }}
            />
            {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/50 rounded-full p-4">
                        <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                </div>
            )}
        </div>
    );
};
