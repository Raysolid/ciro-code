import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/** 滚动阻尼感：略高的 scrub，观感更“沉” */
const SCRUB = 1.2;
const EASE = 'power2.out';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function revealAll() {
  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
    el.style.opacity = '1';
    el.style.transform = 'none';
    el.classList.add('is-in');
  });
  document.querySelectorAll<HTMLElement>('[data-story-item]').forEach((el) => {
    el.style.opacity = '1';
    el.style.transform = 'none';
    el.style.filter = 'none';
  });
}

function heroIntro() {
  const hero = document.querySelector<HTMLElement>('#hero');
  if (!hero) return;

  const parts = hero.querySelectorAll(
    '.hero__badge, h1, .hero__tagline, .install-bar, .hero__hint, .hero__actions',
  );
  gsap.from(parts, {
    opacity: 0.25,
    y: 16,
    duration: 0.72,
    stagger: 0.09,
    ease: EASE,
    delay: 0.06,
    clearProps: 'all',
  });
}

function isNestedReveal(el: HTMLElement) {
  return Boolean(el.parentElement?.closest('[data-reveal]'));
}

function scrollReveals() {
  const nodes = gsap.utils
    .toArray<HTMLElement>('[data-reveal]')
    .filter((el) => el.id !== 'hero' && !isNestedReveal(el));

  nodes.forEach((el) => {
    if (el.id === 'showcase' || el.id === 'product') {
      el.classList.add('is-in');
      const headingBits = el.querySelectorAll<HTMLElement>(
        ':scope > .wrap > .eyebrow, :scope > .wrap > h2, :scope > .wrap > .section__lead',
      );
      if (headingBits.length) {
        gsap.set(headingBits, { opacity: 0, y: 16 });
        ScrollTrigger.create({
          trigger: el,
          start: 'top 80%',
          once: true,
          onEnter: () => {
            gsap.to(headingBits, {
              opacity: 1,
              y: 0,
              duration: 0.72,
              stagger: 0.08,
              ease: EASE,
              clearProps: 'transform',
            });
          },
        });
      }
      if (el.id === 'product') {
        const tabs = el.querySelector<HTMLElement>('.stage__tabs');
        const panels = el.querySelector<HTMLElement>('.stage__panels');
        const bits = [tabs, panels].filter(Boolean) as HTMLElement[];
        gsap.set(bits, { opacity: 0, y: 16 });
        ScrollTrigger.create({
          trigger: el,
          start: 'top 82%',
          once: true,
          onEnter: () => {
            gsap.to(bits, {
              opacity: 1,
              y: 0,
              duration: 0.78,
              stagger: 0.1,
              delay: 0.04,
              ease: EASE,
              clearProps: 'transform',
            });
          },
        });
      }
      return;
    }

    const qsPanel = el.querySelector<HTMLElement>('.qs-panel');
    const qsSteps = qsPanel
      ? Array.from(qsPanel.querySelectorAll<HTMLElement>('.qs-step'))
      : [];

    if (qsPanel && qsSteps.length) {
      const headingBits = el.querySelectorAll<HTMLElement>(
        ':scope > .qs-layout > .qs-copy > .eyebrow, :scope > .qs-layout > .qs-copy > h2, :scope > .qs-layout > .qs-copy > .section__lead, :scope > .qs-layout > .qs-copy > .text-link',
      );
      gsap.set([...headingBits, qsPanel], { opacity: 0, y: 20 });
      gsap.set(qsSteps, { opacity: 0, y: 12 });
      ScrollTrigger.create({
        trigger: el,
        start: 'top 80%',
        once: true,
        onEnter: () => {
          gsap.to(headingBits, {
            opacity: 1,
            y: 0,
            duration: 0.7,
            ease: EASE,
            clearProps: 'transform',
          });
          gsap.to(qsPanel, {
            opacity: 1,
            y: 0,
            duration: 0.75,
            delay: 0.06,
            ease: EASE,
            clearProps: 'transform',
          });
          gsap.to(qsSteps, {
            opacity: 1,
            y: 0,
            duration: 0.7,
            stagger: 0.07,
            delay: 0.12,
            ease: EASE,
            clearProps: 'transform',
          });
          el.classList.add('is-in');
        },
      });
      return;
    }

    gsap.set(el, { opacity: 0, y: 18 });
    ScrollTrigger.create({
      trigger: el,
      start: 'top 82%',
      once: true,
      onEnter: () => {
        gsap.to(el, {
          opacity: 1,
          y: 0,
          duration: 0.75,
          ease: EASE,
          clearProps: 'transform',
          onComplete: () => el.classList.add('is-in'),
        });
      },
    });
  });
}

function depthParallax() {
  gsap.utils.toArray<HTMLElement>('[data-parallax]').forEach((el) => {
    const speed = Number(el.dataset.parallax) || 0.12;
    gsap.to(el, {
      y: () => speed * 90,
      ease: 'none',
      scrollTrigger: {
        trigger: el.closest('section') ?? el,
        start: 'top bottom',
        end: 'bottom top',
        scrub: SCRUB,
      },
    });
  });
}

function showcaseCinematic() {
  gsap.utils.toArray<HTMLElement>('.showcase__row').forEach((row, i) => {
    const img = row.querySelector<HTMLElement>('[data-media-scale]');
    const copy = row.querySelector<HTMLElement>('.showcase__copy');

    gsap.set(row, { opacity: 0, y: 24, x: i % 2 === 0 ? -10 : 10 });
    ScrollTrigger.create({
      trigger: row,
      start: 'top 82%',
      once: true,
      onEnter: () => {
        gsap.to(row, {
          opacity: 1,
          y: 0,
          x: 0,
          duration: 0.8,
          delay: 0.03,
          ease: EASE,
          clearProps: 'transform',
          onComplete: () => row.classList.add('is-in'),
        });
      },
    });

    if (img) {
      gsap.fromTo(
        img,
        { scale: 1.05, y: 14 },
        {
          scale: 1,
          y: 0,
          ease: 'none',
          scrollTrigger: {
            trigger: row,
            start: 'top 85%',
            end: 'bottom 40%',
            scrub: SCRUB,
          },
        },
      );
    }

    if (copy) {
      gsap.fromTo(
        copy,
        { y: 20 },
        {
          y: -8,
          ease: 'none',
          scrollTrigger: {
            trigger: row,
            start: 'top bottom',
            end: 'bottom top',
            scrub: SCRUB,
          },
        },
      );
    }
  });
}

function stageParallax() {
  const shell = document.querySelector<HTMLElement>('#product');
  const visual = shell?.querySelector<HTMLElement>('.stage__panels');
  if (!shell || !visual) return;

  gsap.fromTo(
    visual,
    { y: 20, scale: 0.99 },
    {
      y: -14,
      scale: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: shell,
        start: 'top bottom',
        end: 'bottom top',
        scrub: SCRUB,
      },
    },
  );
}

function modesHorizontal() {
  const section = document.querySelector<HTMLElement>('.modes-rail');
  const pin = section?.querySelector<HTMLElement>('.modes-rail__pin');
  const track = section?.querySelector<HTMLElement>('[data-modes-track]');
  const viewport = section?.querySelector<HTMLElement>('.modes-rail__viewport');
  const dots = section?.querySelectorAll<HTMLElement>('[data-modes-dots] i');
  const cards = section ? gsap.utils.toArray<HTMLElement>('.modes-rail__card') : [];
  if (!section || !pin || !track || !viewport) return;

  ScrollTrigger.matchMedia({
    '(min-width: 48rem)': () => {
      const getScroll = () => Math.max(0, track.scrollWidth - viewport.clientWidth);
      gsap.to(track, {
        x: () => -getScroll(),
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          pin: pin,
          scrub: SCRUB,
          start: 'top top',
          end: () => `+=${getScroll() + window.innerHeight * 0.55}`,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const n = Math.max(1, cards.length - 1);
            const pos = self.progress * n;
            const idx = Math.min(cards.length - 1, Math.round(pos));
            dots?.forEach((d, i) => d.classList.toggle('is-active', i === idx));
            cards.forEach((card, i) => {
              const dist = Math.abs(pos - i);
              const focus = Math.max(0, 1 - dist * 0.85);
              gsap.set(card, {
                opacity: 0.42 + focus * 0.58,
                scale: 0.94 + focus * 0.06,
              });
            });
          },
        },
      });
    },
    '(max-width: 47.99rem)': () => {
      section.classList.add('modes-rail--stack');
      gsap.set(track, { clearProps: 'transform' });
      gsap.set(cards, { clearProps: 'opacity,scale' });
    },
  });
}

/**
 * 能力叙事：对齐 example.html 的抽屉/扑克牌叠层
 * sticky 停靠后，下一张顶上时 scale + rotateX + brightness
 */
function storySticky() {
  const intro = document.querySelector<HTMLElement>('.story__intro');
  const cards = gsap.utils.toArray<HTMLElement>('[data-story-item]');
  if (!cards.length) return;

  if (intro) {
    gsap.from(intro.children, {
      opacity: 0,
      y: 14,
      duration: 0.72,
      stagger: 0.08,
      ease: EASE,
      scrollTrigger: {
        trigger: intro,
        start: 'top 80%',
        once: true,
      },
    });
  }

  const stickyTopRatio = 0.15;

  const updateStack = () => {
    const vh = window.innerHeight;
    const stickyTop = vh * stickyTopRatio;
    let active = 0;

    cards.forEach((card, index) => {
      let progress = 0;
      if (index < cards.length - 1) {
        const nextTop = cards[index + 1].getBoundingClientRect().top;
        if (nextTop <= stickyTop) {
          progress = 1;
        } else if (nextTop < stickyTop + vh) {
          progress = 1 - (nextTop - stickyTop) / vh;
          progress = Math.max(0, Math.min(1, progress));
        }
      }

      if (progress > 0) {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const scale = 1 - progress * (isDark ? 0.1 : 0.06);
        const rotateX = progress * (isDark ? 5 : 3);
        // 亮色下避免叠层压成近黑块；暗色保留更强纵深
        const brightness = 1 - progress * (isDark ? 0.32 : 0.1);
        card.style.transform = `perspective(1000px) scale(${scale}) rotateX(${rotateX}deg)`;
        card.style.filter = `brightness(${brightness})`;
      } else {
        card.style.transform = 'perspective(1000px) scale(1) rotateX(0deg)';
        card.style.filter = 'brightness(1)';
      }

      // 完全被盖住后隐藏，避免缩放后底边从当前卡下方露出
      card.classList.toggle('is-stacked', progress >= 0.98);

      const rect = card.getBoundingClientRect();
      if (rect.top <= stickyTop + 12 && rect.bottom >= stickyTop) {
        active = index;
      }
    });

    cards.forEach((card, i) => card.classList.toggle('is-active', i === active));
  };

  ScrollTrigger.create({
    trigger: document.querySelector('.story__stack') ?? cards[0],
    start: 'top bottom',
    end: 'bottom top',
    onUpdate: updateStack,
    onRefresh: updateStack,
  });
  updateStack();
}

function faqReveal() {
  const panel = document.querySelector<HTMLElement>('[data-faq-panel]');
  if (!panel) return;
  gsap.set(panel, { opacity: 0, y: 18 });
  ScrollTrigger.create({
    trigger: panel,
    start: 'top 82%',
    once: true,
    onEnter: () => {
      gsap.to(panel, {
        opacity: 1,
        y: 0,
        duration: 0.78,
        ease: EASE,
        clearProps: 'transform',
      });
    },
  });
}

function scrollTimeline() {
  const rail = document.querySelector<HTMLElement>('[data-scroll-rail]');
  if (!rail) return;

  const links = gsap.utils.toArray<HTMLAnchorElement>('[data-anchor-link]');
  const ids = links.map((a) => a.dataset.anchorLink).filter(Boolean) as string[];

  const setActive = (id: string) => {
    links.forEach((a) => a.classList.toggle('is-active', a.dataset.anchorLink === id));
  };

  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    ScrollTrigger.create({
      trigger: el,
      start: 'top 45%',
      end: 'bottom 45%',
      onEnter: () => setActive(id),
      onEnterBack: () => setActive(id),
    });
  });

  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: (self) => {
      rail.classList.toggle('is-visible', self.scroll() > 100);
    },
  });

  // 微交互：点击锚点平滑滚动
  links.forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.dataset.anchorLink;
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
    });
  });
}

function stickyHeader() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

function microHover() {
  if (reduceMotion()) return;
  document.querySelectorAll<HTMLElement>('.modes-rail__card, .btn, .icon-btn').forEach((el) => {
    el.addEventListener('pointerenter', () => {
      gsap.to(el, { y: -2, duration: 0.22, ease: EASE, overwrite: 'auto' });
    });
    el.addEventListener('pointerleave', () => {
      gsap.to(el, { y: 0, duration: 0.28, ease: EASE, overwrite: 'auto' });
    });
  });
}

export function initMotion() {
  stickyHeader();

  if (reduceMotion()) {
    revealAll();
    scrollTimeline();
    return;
  }

  document.documentElement.classList.add('has-gsap');
  heroIntro();
  scrollReveals();
  depthParallax();
  showcaseCinematic();
  stageParallax();
  modesHorizontal();
  storySticky();
  faqReveal();
  scrollTimeline();
  microHover();
  ScrollTrigger.refresh();
}

initMotion();
