(() => {
  'use strict';
  const section = document.querySelector('.tracking-section');
  if (!section) return;
  const buttons = [...section.querySelectorAll('[data-tracking-stage]')];
  const preview = section.querySelector('.tracking-preview');
  const path = section.querySelector('#tracking-road');
  const route = section.querySelector('.tracking-route-progress');
  const marker = section.querySelector('[data-tracking-marker]');
  const replay = section.querySelector('[data-tracking-replay]');
  const progressBars = [...section.querySelectorAll('.tracking-progress > span')];
  const announcement = section.querySelector('[data-tracking-announcement]');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (buttons.length !== 3 || !path || !route || !marker || !replay) return;

  const stages = [
    { position: 0, title: 'Your rider is at pickup', description: 'The journey starts with collecting your item.' },
    { position: .62, title: 'On the way to you', description: 'Your rider’s location keeps you in the picture.' },
    { position: 1, title: 'Delivered to your destination', description: 'Check the completed delivery in your request.' },
  ];
  const length = path.getTotalLength();
  let position = .62;
  let selected = 1;
  let frame = 0;
  let playing = false;
  let inView = false;
  let introduced = false;
  let lastAnnouncement = -1;

  const paintPosition = value => {
    position = Math.max(0, Math.min(1, value));
    const point = path.getPointAtLength(length * position);
    marker.setAttribute('transform', 'translate(' + point.x + ' ' + point.y + ')');
    route.style.strokeDashoffset = String(1 - position);
  };
  const showStage = (index, announce = false) => {
    selected = index;
    const stage = stages[index];
    preview.dataset.stage = String(index);
    section.querySelector('[data-tracking-status]').textContent = stage.title;
    section.querySelector('[data-tracking-description]').textContent = stage.description;
    section.querySelector('[data-tracking-count]').textContent = '0' + (index + 1) + ' / 03';
    buttons.forEach((button, current) => {
      button.classList.toggle('is-selected', current === index);
      button.setAttribute('aria-pressed', String(current === index));
    });
    progressBars.forEach((bar, current) => {
      bar.classList.toggle('is-done', current < index || index === 2);
      bar.classList.toggle('is-current', current === index && index !== 2);
    });
    if (announce && lastAnnouncement !== index) {
      announcement.textContent = 'Delivery preview: ' + stage.title + '. ' + stage.description;
      lastAnnouncement = index;
    }
  };
  const replayLabel = text => {
    replay.lastChild.textContent = ' ' + text;
    replay.setAttribute('aria-label', text + ' delivery preview');
  };
  const cancelMotion = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    playing = false;
    replayLabel(motion.matches ? 'Next step' : 'Play journey');
  };
  const moveTo = (target, duration) => {
    cancelMotion();
    if (motion.matches || !inView || document.hidden) {
      paintPosition(target);
      return;
    }
    const startPosition = position;
    let startTime;
    const tick = time => {
      startTime ??= time;
      const fraction = Math.min(1, (time - startTime) / duration);
      const eased = fraction * fraction * (3 - 2 * fraction);
      paintPosition(startPosition + (target - startPosition) * eased);
      if (fraction < 1) frame = requestAnimationFrame(tick);
      else frame = 0;
    };
    frame = requestAnimationFrame(tick);
  };
  buttons.forEach((button, index) => {
    button.disabled = false;
    button.addEventListener('click', () => {
      introduced = true;
      showStage(index, true);
      moveTo(stages[index].position, 1200);
    });
  });
  replay.hidden = false;
  section.querySelector('[data-tracking-hint]').hidden = false;
  replay.addEventListener('click', () => {
    introduced = true;
    if (playing) {
      cancelMotion();
      return;
    }
    cancelMotion();
    // Reduced-motion users explore the same states without a moving map.
    if (motion.matches) {
      const next = (selected + 1) % stages.length;
      showStage(next, true);
      paintPosition(stages[next].position);
      replayLabel('Next step');
      return;
    }
    playing = true;
    replayLabel('Pause journey');
    paintPosition(0);
    showStage(0, true);
    let startedAt;
    const tick = time => {
      startedAt ??= time;
      const elapsed = time - startedAt;
      const fraction = Math.max(0, Math.min(1, (elapsed - 600) / 3600));
      paintPosition(fraction);
      const stage = fraction === 0 ? 0 : fraction < 1 ? 1 : 2;
      if (stage !== selected) showStage(stage, true);
      if (elapsed < 4800) frame = requestAnimationFrame(tick);
      else {
        cancelMotion();
        replayLabel('Replay journey');
      }
    };
    frame = requestAnimationFrame(tick);
  });
  showStage(1);
  paintPosition(stages[1].position);
  if (motion.matches) replayLabel('Next step');

  const settle = () => {
    cancelMotion();
    paintPosition(stages[selected].position);
    if (motion.matches) replayLabel('Next step');
  };
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      if (!inView) {
        settle();
        return;
      }
      if (!introduced) {
        introduced = true;
        if (!motion.matches) {
          paintPosition(0);
          moveTo(stages[selected].position, 1800);
        }
      }
    }, {threshold: .15});
    observer.observe(preview);
  } else {
    inView = true;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) settle();
  });
  motion.addEventListener('change', settle);
})();
