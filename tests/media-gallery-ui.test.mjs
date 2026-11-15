import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/media-gallery.js', import.meta.url), 'utf8');
function setup({ sizes = [3, 2], reduced = false } = {}) {
  const frames = [];
  const observers = [];
  const node = () => ({ handlers: {}, attrs: {}, setAttribute(name, value) { this.attrs[name] = value; },
    addEventListener(name, handler) { this.handlers[name] = handler; } });
  const galleries = sizes.map(size => {
    const videos = [];
    const slides = Array.from({ length: size }, (_, index) => {
      const video = { ...node(), pauses: 0, plays: 0, pause() { this.pauses++; }, closest() { return this.slide.inert ? this.slide : null; } };
      const slide = { ...node(), offsetLeft: index * 300, querySelectorAll: () => [video] };
      video.slide = slide;
      videos.push(video);
      return slide;
    });
    const controls = node(), previous = node(), next = node(), status = node();
    const track = { ...node(), scrollLeft: 0, querySelectorAll: () => slides,
      scrollTo(options) { this.lastScroll = options; this.scrollLeft = options.left; this.handlers.scroll?.(); } };
    const gallery = { ...node(), querySelector: selector => ({ '[data-gallery-track]': track,
      '[data-gallery-controls]': controls, '[data-gallery-prev]': previous,
      '[data-gallery-next]': next, '[data-gallery-status]': status })[selector], querySelectorAll: () => videos };
    return { gallery, track, slides, videos, controls, previous, next, status };
  });
  const document = { ...node(), hidden: false, querySelectorAll: selector => selector === '[data-media-gallery]'
    ? galleries.map(item => item.gallery) : galleries.flatMap(item => item.videos) };
  class Observer { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} }
  vm.runInNewContext(source, { document, matchMedia: () => ({ matches: reduced }),
    requestAnimationFrame: callback => frames.push(callback), IntersectionObserver: Observer });
  const flush = () => { while (frames.length) frames.shift()(); };
  const fire = (element, name, extra = {}) => {
    const event = { target: element, prevented: false, preventDefault() { this.prevented = true; }, ...extra };
    element.handlers[name]?.(event);
    flush();
    return event;
  };
  return { galleries, document, observers, flush, fire };
}

test('arrows and swipe change slides, update the counter and pause the outgoing video without autoplay', () => {
  const ui = setup();
  const item = ui.galleries[0];
  assert.equal(item.status.textContent, '1 / 3');
  assert.equal(item.controls.hidden, false);
  assert.equal(item.slides[0].inert, false);
  assert.equal(item.slides[1].inert, true);
  const pauses = item.videos[0].pauses;
  ui.fire(item.next, 'click');
  assert.equal(item.status.textContent, '2 / 3');
  assert.equal(item.track.lastScroll.left, 300);
  assert(item.videos[0].pauses > pauses);
  ui.fire(item.track, 'pointerdown');
  item.track.scrollLeft = 600;
  ui.fire(item.track, 'scroll');
  assert.equal(item.status.textContent, '3 / 3');
  ui.fire(item.next, 'click');
  assert.equal(item.status.textContent, '1 / 3');
  assert(item.videos.every(video => video.plays === 0));
});

test('gallery keyboard navigation respects reduced motion and leaves native video keys alone', () => {
  const ui = setup({ reduced: true });
  const item = ui.galleries[0];
  assert.equal(ui.fire(item.track, 'keydown', { key: 'End' }).prevented, true);
  assert.equal(item.status.textContent, '3 / 3');
  assert.equal(item.track.lastScroll.behavior, 'auto');
  const native = ui.fire(item.track, 'keydown', { key: 'ArrowRight', target: item.videos[2] });
  assert.equal(native.prevented, false);
  assert.equal(item.status.textContent, '3 / 3');
  ui.fire(item.track, 'keydown', { key: 'Home' });
  assert.equal(item.status.textContent, '1 / 3');
});

test('only one gallery video plays at once and hidden/off-screen videos are paused', () => {
  const ui = setup();
  const first = ui.galleries[0], second = ui.galleries[1];
  const prior = second.videos[0].pauses;
  ui.fire(first.videos[0], 'play');
  assert(second.videos[0].pauses > prior);
  const own = first.videos[0].pauses;
  ui.document.hidden = true;
  ui.fire(ui.document, 'visibilitychange');
  assert(first.videos[0].pauses > own);
  const offscreen = first.videos[0].pauses;
  ui.observers[0].callback([{ target: first.gallery, isIntersecting: false }]);
  assert(first.videos[0].pauses > offscreen);
});

test('a single item needs no arrows and an empty gallery does not hide fallback content', () => {
  const ui = setup({ sizes: [1, 0] });
  assert.equal(ui.galleries[0].controls.hidden, true);
  assert.equal(ui.galleries[0].status.textContent, '1 / 1');
  assert.equal(ui.galleries[1].gallery.hidden, undefined);
});
