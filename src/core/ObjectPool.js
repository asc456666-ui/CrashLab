/**
 * 简易对象池。火花、烟雾、碎片全部复用，禁止运行时反复创建销毁。
 */
export class ObjectPool {
  constructor(createFn, resetFn, maxSize = 48) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
    this.idle = [];
    this.active = [];
  }

  spawn() {
    let item = this.idle.pop();
    if (!item) {
      if (this.active.length >= this.maxSize) return null;
      item = this.createFn();
    }
    this.active.push(item);
    return item;
  }

  recycle(item) {
    const i = this.active.indexOf(item);
    if (i >= 0) this.active.splice(i, 1);
    this.resetFn(item);
    this.idle.push(item);
  }

  clear() {
    for (const item of this.active) {
      this.resetFn(item);
      this.idle.push(item);
    }
    this.active.length = 0;
  }
}
