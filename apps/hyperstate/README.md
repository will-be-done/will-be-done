Top features:

1. You can use selectors in actions! In redux you can't use selector in reducer
2. React-foreget ready
3. No too much maigck like in legend
5. Focused on devtools. You can see all function call names in devtool. Also special helper. Show how it looks for other instruments. And show react-scan support
6. Fast refresh just working!
7. Mention mobx weird bug(when I deelete one focused item - all other was deleteing) due it's mutability. How react don't likes mutables
8. You can maintain all your code in one file for fast prototyping!
9. All redux ecosystem! Like devtool and special sites for redux replay
10. Much much much less boilerplate then redux
11. Full HMR support, even selector! Redux don't have this

The probelm: there is not good state manager that will be less verbious then redux, and not so mutable as mobx.
We have zusteand, but it's tied to hooks. We have atoms, but it's too verbous on my opinion

I want:
1. Have immutable state manager, with all benefits as redux have and good integration with react forget. It also iunclude easy undo/redo ingration(mobx has problem with hook approoach where you need to wrap eveyting with observe + react hook approach relies more on immutable data, while with mutable approache you are going to have prlbems with use memo/use effect deps tracking and not only) And mobx ingertes really bad with react scan
2. Ability to track where data is changed. No diffing, but really just select. Dif on big state too expensive
It's easy to do with mobx(you jsut scrubeibe on specific field change) and very unperfomrant for redux
3. Ability to call global selectors in actions/reducer
4. Good chrome devtool support(no anoyunoums and weird funcitons calls without any context)
5. Decent performance of selectors, like mobx has. Redux reselect too verbous,
 you need to define selector beforehand
6. Ability to eaily describe state. With mobx class appoach I loose ability to use unions. Or I will need to use inheritance.
7. Easy to use(no need twice about how to do things), easy to scale and with good react
integration.
8. And devtool. Maybe own or maybe reuse redux devtool.
9. Immutable state. Where I can easy define any shape of state. Like, I can define OR type. And with mobx I would need to use inheritance or move methods out of class.
10. Project is battle test on medium size project. I am building todo app, and every day
I poslish hyperstate to make sure that it's easy to use from DX perspective.
11. Also, code should look straight. Selector looks like just simple functions, actions
too.

redux - easy to use-, easy to scale+, works good with react +
mobx - easy to use+, easy to scale+, works good with react -

TO ADD:
1. Example with deepEqual + big sorting list
2. Add bob martin link about thought about he don't like sql. And I think sql on frontend is bad idea. TOO MUCH QUERIES TO WRITE
3. Menotion how much times I tried to build local first from scratch. That it's
very hard task. List all attempts

Why not mobx-keystone:
1. Too much magic. Due it's complexity hard to debug issues. 
2. It more looks like a hack overall. Models extends
3. decorators
4. performance
5. too magic. 



Also, where hyper state shine - updating in a big list with help of memoize!

## State Management for Local-First: Why I Ditched MobX/Redux for Immer

Building a local-first mobile app means managing state in memory, often lots of it. I started with `mobx-keystone` because tracking model changes felt easy. But honestly, MobX and React haven't been playing nice for a while now, especially with hooks. `useEffect` can get tricky, and I'm worried React Forget will just make things worse. MobX feels like it's drifting away from the core React ecosystem.

So, I thought about Redux. But the big problem there is figuring out *what actually changed*. For local-first, I need to know precisely which entity got updated to persist it efficiently. With Redux, I'd have to write middleware to diff the *entire* state tree, or at least big chunks of it, after every action. For lots of entities, that sounds like a performance nightmare. Plus, reducers don't get global state access easily – you need thunks or sagas. And let's face it, even with Redux Toolkit, the action/reducer boilerplate can still be a drag.

### Why Not Redux?

1.  **Slow Diffing for Changes:** No built-in way to quickly know *which specific entity* changed. You have to manually compare state trees after the fact, which is slow for big states.
2.  **No Global State in Reducers:** Reducers are isolated. Need middleware (Thunks, Sagas, etc.) just to read other state slices or dispatch follow-up actions. Adds layers.
3.  **Boilerplate:** Even with RTK, defining actions, reducers, etc., feels more verbose than I'd like.

### Why Not MobX?

1.  **Bad Fit with React:** React increasingly prefers immutable data. MobX's mutable approach causes friction, especially with hooks like `useEffect` relying on reference checks. Can lead to bugs.
2.  **Debugging Performance:** Harder to use React DevTools profiler ("react scan") to pinpoint performance issues when MobX reactions trigger renders indirectly.
3.  **Hooks & React Forget:** `useEffect` dependencies are complex with external mutations. Upcoming React Forget might struggle to optimize components reliably with MobX.
4.  **Out of Ecosystem:** Feels less integrated as React adds features leaning towards immutability.

### What I Actually Need

So, I stepped back. What are the *must-haves* for my state management?

1.  **Track What Changed:** Need to know *exactly* which piece of data (which entity instance) was modified. A mutable coding style for updates is preferred for DX.
2.  **Global State Access:** Actions *must* be able to read from and write to any part of the state, atomically.
3.  **Undo/Redo:** Need a straightforward way to implement this.
4.  **Good React Integration:** Should work predictably with React components and hooks, like Redux does.
5.  **Redux DevTools Support:** Time-travel debugging is invaluable.

### The Immer Approach: Simple, Direct, Powerful

I realized Immer itself could be the foundation. Forget the big frameworks for a moment. What if the core was just:

1.  Hold the entire state in a single object.
2.  Wrap *every* state modification in Immer's `produce`.
3.  Enable and capture the `patches` generated by `produce`.

This simple setup, built with a custom store, hits all my requirements:

1.  **Track What Changed:** Immer's `patches` give me the *exact* granular changes (`{ op: 'replace', path: ['tasks', 'task-123', 'title'], value: 'New Title' }`). No diffing needed! And `produce` lets me write simple, mutable-looking code (`draft.tasks[id].title = ...`).
2.  **Global State Access:** The `produce` function gets the entire `draft` state. My actions have full read/write access to everything. Nested actions? Easy, they just operate on the same shared `draft` within the single `produce` call, so changes are immediately visible.
3.  **Undo/Redo:** Immer generates `inversePatches` alongside `patches`. Storing these makes undo/redo trivial: apply inverse patches to undo, reapply original patches to redo.
4.  **Good React Integration:** Because `produce` always returns a new, immutable state object *if changes were made*, it fits perfectly with React's rendering model based on reference equality. I need to build my own subscription layer (using Context or custom hooks), but the *state itself* is React-friendly.
5.  **Redux DevTools Support:** My custom store can easily be hooked up to the Redux DevTools extension by sending the action details and the state snapshots.

**Bonus: Atomicity & Performance**
Because nested actions all run within the *same* outer `produce` call, the entire operation is atomic. It either all succeeds, or the draft is discarded, leaving the original state untouched. Plus, Immer is highly optimized (copy-on-write, structural sharing), so it's fast even with large states.

**The Catch?**
The trade-off is obvious: I'm building a mini-framework. The store logic, the dispatch mechanism, the React bindings, the DevTools connection – that's code I have to write and maintain, stuff that Redux Toolkit or Zustand give you for free.

**Conclusion**
For my specific needs – especially the critical requirement for efficient, granular change tracking in a local-first app – this custom Immer-based approach provides the best balance. It gives me the precise capabilities I need without the drawbacks or impedance mismatch I found with Redux or MobX in the context of modern React. It's more DIY, but it directly solves the core problems.


Why selector this way?

Check https://github.com/dai-shi/proxy-memoize/issues/81 , proxy based will not work
Also, I don't like that I need to declare deps beforehand like it's done in reselect 
