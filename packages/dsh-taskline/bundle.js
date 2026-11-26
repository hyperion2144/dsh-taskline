const groupKey = Symbol.for('cordis.group')
const init = Symbol.for('cordis.init')
export default class TasklineBundle {
  static inject = ['loader']
  static [groupKey] = true
  constructor(ctx, config) { this.ctx = ctx; this.config = config }
  async *[init]() {
    const Group = this.ctx.loader?.builtins?.group
    if (typeof Group !== 'function') throw new Error('dsh-taskline/bundle needs the loader group builtin')
    const entries = Array.isArray(this.config) ? this.config : []
    const group = new Group(this.ctx, entries)
    yield () => group.stop()
    await group.update(entries)
  }
}
