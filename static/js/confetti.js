document.addEventListener("DOMContentLoaded", () => {
    const logo = document.getElementById("logo-trigger");
    const canvas = document.getElementById("snow-canvas");
    const ctx = canvas.getContext("2d");
  
    // Проверяем, включен ли снег в прошлый раз (по умолчанию выключен)
    let isSnowing = localStorage.getItem("snow_enabled") === "true";
    let snowflakes = [];
    let animationId;
  
    // Подгоняем размер холста под экран
    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();
  
    // Класс снежинки
    class Snowflake {
      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 6 + 4; 
        this.speedY = Math.random() * 0.8 + 0.3; 
        this.speedX = Math.random() * 0.4 - 0.2; 
        this.opacity = Math.random() * 0.4 + 0.4; 
      }
  
      update() {
        this.y += this.speedY;
        this.x += this.speedX;
  
        if (this.y > canvas.height) {
          this.y = -20;
          this.x = Math.random() * canvas.width;
        }
        if (this.x > canvas.width) this.x = 0;
        if (this.x < 0) this.x = canvas.width;
      }
  
      draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.strokeStyle = `rgba(160, 200, 240, ${this.opacity})`; 
        ctx.lineWidth = 1.2;
  
        for (let i = 0; i < 6; i++) {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, this.size);
          
          ctx.moveTo(0, this.size * 0.6);
          ctx.lineTo(this.size * 0.3, this.size * 0.85);
          ctx.moveTo(0, this.size * 0.6);
          ctx.lineTo(-this.size * 0.3, this.size * 0.85);
          
          ctx.stroke();
          ctx.rotate(Math.PI / 3);
        }
        ctx.restore();
      }
    }
  
    function initSnow() {
      snowflakes = [];
      for (let i = 0; i < 50; i++) {
        snowflakes.push(new Snowflake());
      }
    }
  
    function animateSnow() {
      if (!isSnowing) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      snowflakes.forEach(flake => {
        flake.update();
        flake.draw();
      });
      
      animationId = requestAnimationFrame(animateSnow);
    }
  
    function startSnow() {
      isSnowing = true;
      localStorage.setItem("snow_enabled", "true"); // Запоминаем, что снег включен
      canvas.style.display = "block";
      initSnow();
      animateSnow();
    }
  
    function stopSnow() {
      isSnowing = false;
      localStorage.setItem("snow_enabled", "false"); // Запоминаем, что снег выключен
      canvas.style.display = "none";
      cancelAnimationFrame(animationId);
    }
  
    // Клик по логотипу
    if (logo) {
      logo.addEventListener("click", (e) => {
        e.preventDefault(); 
        if (!isSnowing) {
          startSnow();
        } else {
          stopSnow();
        }
      });
    }
  
    // ЕСЛИ СНЕГ БЫЛ ВКЛЮЧЕН - ЗАПУСКАЕМ ЕГО СРАЗУ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ
    if (isSnowing) {
      startSnow();
    }
  });