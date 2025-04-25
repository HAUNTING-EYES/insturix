"use client";

import type React from "react";
import { useRef, useEffect, forwardRef } from "react";

interface ChatCanvasProps {
  messages: Array<{ role: string; content: string; id: string }>;
}

export const ChatCanvas = forwardRef<HTMLCanvasElement, ChatCanvasProps>(
  ({ messages }, ref) => {
    const canvasRef = ref as React.RefObject<HTMLCanvasElement>;
    const particlesRef = useRef<
      Array<{
        x: number;
        y: number;
        radius: number;
        color: string;
        vx: number;
        vy: number;
        life: number;
        maxLife: number;
      }>
    >([]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Set canvas to full screen
      const resizeCanvas = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      };

      resizeCanvas();
      window.addEventListener("resize", resizeCanvas);

      // Create particles when new messages are added
      if (
        messages.length > 0 &&
        messages[messages.length - 1].role === "user"
      ) {
        createParticles(canvas.width / 2, canvas.height - 100, 20, "#3b82f6");
      } else if (
        messages.length > 0 &&
        messages[messages.length - 1].role === "assistant"
      ) {
        createParticles(canvas.width / 2, canvas.height / 2, 20, "#10b981");
      }

      // Animation loop
      let animationFrameId: number;
      const render = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        updateParticles(ctx);
        animationFrameId = window.requestAnimationFrame(render);
      };
      render();

      return () => {
        window.removeEventListener("resize", resizeCanvas);
        window.cancelAnimationFrame(animationFrameId);
      };
    }, [messages, canvasRef]);

    const createParticles = (
      x: number,
      y: number,
      count: number,
      color: string
    ) => {
      for (let i = 0; i < count; i++) {
        particlesRef.current.push({
          x,
          y,
          radius: Math.random() * 3 + 1,
          color,
          vx: (Math.random() - 0.5) * 3,
          vy: (Math.random() - 0.5) * 3,
          life: 0,
          maxLife: Math.random() * 100 + 50,
        });
      }
    };

    const updateParticles = (ctx: CanvasRenderingContext2D) => {
      particlesRef.current = particlesRef.current.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life++;

        // Fade out based on life
        const opacity = 1 - p.life / p.maxLife;
        if (opacity <= 0) return false;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle =
          p.color +
          Math.floor(opacity * 255)
            .toString(16)
            .padStart(2, "0");
        ctx.fill();

        return p.life < p.maxLife;
      });
    };

    return (
      <canvas
        ref={canvasRef}
        className="fixed top-0 left-0 w-full h-full pointer-events-none z-0"
      />
    );
  }
);

ChatCanvas.displayName = "ChatCanvas";
