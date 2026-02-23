# PostHog Astro (Static) Example Project

Repository: https://github.com/PostHog/context-mill
Path: basics/astro-static

---

## README.md

# PostHog Astro Static Example

This is an [Astro](https://astro.build/) static site (SSG) example demonstrating PostHog integration with product analytics, session replay, and error tracking.

It uses the PostHog web snippet directly and shows how to:

- Initialize PostHog in a static Astro site using a reusable component
- Identify users after login
- Track custom events from pages
- Capture errors via `posthog.captureException()`
- Reset PostHog state on logout

## Features

- **Product analytics**: Track login and burrito consideration events
- **Session replay**: Enabled via PostHog snippet configuration
- **Error tracking**: Manual error capture sent to PostHog
- **Simple auth flow**: Demo login using localStorage

## Getting started

### 1. Install dependencies

```bash
npm install
# or
pnpm install
```

### 2. Configure environment variables

Create a `.env` file in the project root:

```bash
PUBLIC_POSTHOG_KEY=your_posthog_project_api_key
PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

Get your PostHog API key from your project settings in PostHog.

### 3. Run the development server

```bash
npm run dev
# or
pnpm dev
```

Open `http://localhost:4321` in your browser.

## Project structure

```text
src/
  components/
    posthog.astro      # PostHog snippet with is:inline directive
    Header.astro       # Navigation + logout, calls posthog.reset()
  layouts/
    PostHogLayout.astro # Root layout that includes PostHog + Header
  lib/
    auth.ts            # Auth utilities (localStorage-based)
  pages/
    index.astro        # Login form, identifies user + captures 'user_logged_in'
    burrito.astro      # Burrito consideration demo, captures 'burrito_considered'
    profile.astro      # Profile + error tracking demo
  styles/
    global.css         # Global styles
```

## Key integration points

### PostHog initialization (`src/components/posthog.astro`)

The PostHog snippet is included as an inline script to prevent Astro from processing it:

```astro
<script is:inline>
  !function(t,e){...}(document,window.posthog||[]);
  posthog.init('<ph_project_api_key>', {
    api_host: 'https://us.i.posthog.com',
    defaults: '2026-01-30'
  })
</script>
```

The `is:inline` directive is required to prevent TypeScript errors about `window.posthog`.

### User identification (`src/pages/index.astro`)

After a successful "login", the app identifies the user and captures a login event:

```javascript
window.posthog?.identify(username);
window.posthog?.capture("user_logged_in");
```

Identification happens **only on login**, all further requests will automatically use the same distinct ID.

### Event tracking (`src/pages/burrito.astro`)

The burrito page tracks a custom event when a user "considers" the burrito:

```javascript
window.posthog?.capture("burrito_considered", {
  total_considerations: newCount,
  username: currentUser,
});
```

This shows how to attach useful properties to events (e.g. counts, usernames).

### Error tracking (`src/pages/profile.astro`)

The profile page includes a button to trigger a test error:

```javascript
try {
  throw new Error("Test error for PostHog error tracking");
} catch (err) {
  window.posthog?.captureException(err);
}
```

### Logout and session reset (`src/components/Header.astro`)

On logout, both the local auth state and PostHog state are cleared:

```javascript
window.posthog?.capture("user_logged_out");
localStorage.removeItem("currentUser");
window.posthog?.reset();
```

`posthog.reset()` clears the current distinct ID and session so the next login starts a fresh identity.

## Scripts

```bash
# Run dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Learn more

- [PostHog documentation](https://posthog.com/docs)
- [PostHog Astro guide](https://posthog.com/docs/libraries/astro)
- [Astro documentation](https://docs.astro.build/)

---

## .env.example

```example
PUBLIC_POSTHOG_KEY=your_posthog_project_api_key_here
PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

```

---

## astro.config.mjs

```mjs
import { defineConfig } from "astro/config";

export default defineConfig({});

```

---

## src/components/Header.astro

```astro
---
// Header component with navigation and logout functionality
---
<header class="header">
  <div class="header-container">
    <nav>
      <a href="/">Home</a>
      <a href="/burrito" class="auth-link" style="display: none;">Burrito Consideration</a>
      <a href="/profile" class="auth-link" style="display: none;">Profile</a>
    </nav>
    <div class="user-section">
      <span class="welcome-text" style="display: none;">Welcome, <span class="username"></span>!</span>
      <span class="not-logged-in">Not logged in</span>
      <button class="btn-logout" style="display: none;">Logout</button>
    </div>
  </div>
</header>

<script is:inline>
  function updateHeader() {
    const currentUser = localStorage.getItem('currentUser');
    const authLinks = document.querySelectorAll('.auth-link');
    const welcomeText = document.querySelector('.welcome-text');
    const notLoggedIn = document.querySelector('.not-logged-in');
    const logoutBtn = document.querySelector('.btn-logout');
    const usernameSpan = document.querySelector('.username');

    if (currentUser) {
      authLinks.forEach(link => link.style.display = 'inline');
      welcomeText.style.display = 'inline';
      notLoggedIn.style.display = 'none';
      logoutBtn.style.display = 'inline';
      usernameSpan.textContent = currentUser;
    } else {
      authLinks.forEach(link => link.style.display = 'none');
      welcomeText.style.display = 'none';
      notLoggedIn.style.display = 'inline';
      logoutBtn.style.display = 'none';
    }
  }

  function handleLogout() {
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      window.posthog?.capture('user_logged_out');
    }
    localStorage.removeItem('currentUser');
    localStorage.removeItem('burritoConsiderations');
    // IMPORTANT: Reset the PostHog instance to clear the user session
    window.posthog?.reset();
    window.location.href = '/';
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateHeader();
    document.querySelector('.btn-logout')?.addEventListener('click', handleLogout);
  });

  // Listen for storage changes (login/logout in other tabs)
  window.addEventListener('storage', updateHeader);
</script>

<style>
  .header {
    background-color: #333;
    color: white;
    padding: 1rem;
  }

  .header-container {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .header nav {
    display: flex;
    gap: 1rem;
  }

  .header a {
    color: white;
    text-decoration: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    transition: background-color 0.2s;
  }

  .header a:hover {
    background-color: #555;
    text-decoration: none;
  }

  .user-section {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .btn-logout {
    background-color: #dc3545;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  }

  .btn-logout:hover {
    background-color: #c82333;
  }
</style>

```

---

## src/components/posthog.astro

```astro
---
// PostHog analytics snippet
// Uses is:inline to prevent Astro from processing the script
---
<script is:inline define:vars={{ apiKey: import.meta.env.PUBLIC_POSTHOG_KEY, apiHost: import.meta.env.PUBLIC_POSTHOG_HOST }}>
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys getNextSurveyStep onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  posthog.init(apiKey || '', {
    api_host: apiHost || 'https://us.i.posthog.com',
    defaults: '2026-01-30'
  })
</script>

```

---

## src/layouts/PostHogLayout.astro

```astro
---
import PostHog from '../components/posthog.astro';
import Header from '../components/Header.astro';
import '../styles/global.css';

interface Props {
  title: string;
}

const { title } = Astro.props;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Astro PostHog Integration Example" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>{title}</title>
    <PostHog />
  </head>
  <body>
    <Header />
    <main>
      <slot />
    </main>
  </body>
</html>

```

---

## src/lib/auth.ts

```ts
// Client-side auth utilities for localStorage-based authentication

export interface User {
  username: string;
  burritoConsiderations: number;
}

export function getCurrentUser(): User | null {
  if (typeof window === "undefined") return null;

  const username = localStorage.getItem("currentUser");
  if (!username) return null;

  const considerations = parseInt(
    localStorage.getItem("burritoConsiderations") || "0",
    10,
  );

  return {
    username,
    burritoConsiderations: considerations,
  };
}

export function login(username: string, password: string): boolean {
  if (!username || !password) return false;

  localStorage.setItem("currentUser", username);
  // Initialize burrito considerations if not set
  if (!localStorage.getItem("burritoConsiderations")) {
    localStorage.setItem("burritoConsiderations", "0");
  }

  return true;
}

export function logout(): void {
  localStorage.removeItem("currentUser");
  localStorage.removeItem("burritoConsiderations");
}

export function incrementBurritoConsiderations(): number {
  const current = parseInt(
    localStorage.getItem("burritoConsiderations") || "0",
    10,
  );
  const newCount = current + 1;
  localStorage.setItem("burritoConsiderations", newCount.toString());
  return newCount;
}

```

---

## src/pages/burrito.astro

```astro
---
import PostHogLayout from '../layouts/PostHogLayout.astro';
---
<PostHogLayout title="Burrito Consideration - Astro PostHog Example">
  <div class="container">
    <h1>Burrito consideration zone</h1>
    <p>Take a moment to truly consider the potential of burritos.</p>

    <div style="text-align: center;">
      <button id="consider-btn" class="btn-burrito">
        I have considered the burrito potential
      </button>

      <p id="success-message" class="success" style="display: none;">
        Thank you for your consideration! Count: <span id="consideration-count"></span>
      </p>
    </div>

    <div class="stats">
      <h3>Consideration stats</h3>
      <p>Total considerations: <span id="total-considerations">0</span></p>
    </div>
  </div>
</PostHogLayout>

<script is:inline>
  function checkAuth() {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) {
      window.location.href = '/';
      return false;
    }
    return true;
  }

  function updateStats() {
    const count = localStorage.getItem('burritoConsiderations') || '0';
    document.getElementById('total-considerations').textContent = count;
  }

  function handleConsideration() {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) return;

    // Increment the count
    const currentCount = parseInt(localStorage.getItem('burritoConsiderations') || '0', 10);
    const newCount = currentCount + 1;
    localStorage.setItem('burritoConsiderations', newCount.toString());

    // Update the UI
    updateStats();

    const successMessage = document.getElementById('success-message');
    const considerationCount = document.getElementById('consideration-count');
    considerationCount.textContent = newCount;
    successMessage.style.display = 'block';

    // Hide success message after 2 seconds
    setTimeout(() => {
      successMessage.style.display = 'none';
    }, 2000);

    // Capture burrito consideration event in PostHog
    window.posthog?.capture('burrito_considered', {
      total_considerations: newCount,
      username: currentUser
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;

    updateStats();
    document.getElementById('consider-btn')?.addEventListener('click', handleConsideration);
  });
</script>

```

---

## src/pages/index.astro

```astro
---
import PostHogLayout from '../layouts/PostHogLayout.astro';
---
<PostHogLayout title="Home - Astro PostHog Example">
  <div class="container">
    <div id="logged-in-view" style="display: none;">
      <h1>Welcome back, <span id="welcome-username"></span>!</h1>
      <p>You are now logged in. Feel free to explore:</p>
      <ul>
        <li>Consider the potential of burritos</li>
        <li>View your profile and statistics</li>
      </ul>
    </div>

    <div id="logged-out-view">
      <h1>Welcome to Burrito Consideration App</h1>
      <p>Please sign in to begin your burrito journey</p>

      <form id="login-form" class="form">
        <div class="form-group">
          <label for="username">Username:</label>
          <input
            type="text"
            id="username"
            placeholder="Enter any username"
            required
          />
        </div>

        <div class="form-group">
          <label for="password">Password:</label>
          <input
            type="password"
            id="password"
            placeholder="Enter any password"
            required
          />
        </div>

        <p id="error-message" class="error" style="display: none;"></p>

        <button type="submit" class="btn-primary">Sign In</button>
      </form>

      <p class="note">
        Note: This is a demo app. Use any username and password to sign in.
      </p>
    </div>
  </div>
</PostHogLayout>

<script is:inline>
  function updateView() {
    const currentUser = localStorage.getItem('currentUser');
    const loggedInView = document.getElementById('logged-in-view');
    const loggedOutView = document.getElementById('logged-out-view');
    const welcomeUsername = document.getElementById('welcome-username');

    if (currentUser) {
      loggedInView.style.display = 'block';
      loggedOutView.style.display = 'none';
      welcomeUsername.textContent = currentUser;
    } else {
      loggedInView.style.display = 'none';
      loggedOutView.style.display = 'block';
    }
  }

  function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('error-message');

    if (!username || !password) {
      errorMessage.textContent = 'Please provide both username and password';
      errorMessage.style.display = 'block';
      return;
    }

    // Client-side only fake auth - store in localStorage
    localStorage.setItem('currentUser', username);
    if (!localStorage.getItem('burritoConsiderations')) {
      localStorage.setItem('burritoConsiderations', '0');
    }

    // Identify the user in PostHog (once on login is enough)
    window.posthog?.identify(username);
    window.posthog?.capture('user_logged_in');

    // Clear form
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    errorMessage.style.display = 'none';

    // Update view
    updateView();

    // Trigger header update
    window.dispatchEvent(new Event('storage'));
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateView();
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
  });

  // Listen for storage changes
  window.addEventListener('storage', updateView);
</script>

```

---

## src/pages/profile.astro

```astro
---
import PostHogLayout from '../layouts/PostHogLayout.astro';
---
<PostHogLayout title="Profile - Astro PostHog Example">
  <div class="container">
    <h1>User Profile</h1>

    <div class="stats">
      <h2>Your Information</h2>
      <p><strong>Username:</strong> <span id="profile-username"></span></p>
      <p><strong>Burrito Considerations:</strong> <span id="profile-considerations">0</span></p>
    </div>

    <div style="margin-top: 2rem;">
      <h3>Your Burrito Journey</h3>
      <p id="journey-message"></p>
    </div>

    <div style="margin-top: 2rem;">
      <h3>Error Tracking Demo</h3>
      <p>Click the button below to trigger a test error and send it to PostHog:</p>
      <button id="error-btn" class="btn-error">
        Trigger Test Error
      </button>
      <p id="error-feedback" class="success" style="display: none;">
        Error captured and sent to PostHog!
      </p>
    </div>
  </div>
</PostHogLayout>

<script is:inline>
  function checkAuth() {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) {
      window.location.href = '/';
      return false;
    }
    return true;
  }

  function updateProfile() {
    const username = localStorage.getItem('currentUser') || '';
    const considerations = parseInt(localStorage.getItem('burritoConsiderations') || '0', 10);

    document.getElementById('profile-username').textContent = username;
    document.getElementById('profile-considerations').textContent = considerations;

    // Update journey message based on consideration count
    const journeyMessage = document.getElementById('journey-message');
    if (considerations === 0) {
      journeyMessage.textContent = "You haven't considered any burritos yet. Visit the Burrito Consideration page to start!";
    } else if (considerations === 1) {
      journeyMessage.textContent = "You've considered the burrito potential once. Keep going!";
    } else if (considerations < 5) {
      journeyMessage.textContent = "You're getting the hang of burrito consideration!";
    } else if (considerations < 10) {
      journeyMessage.textContent = "You're becoming a burrito consideration expert!";
    } else {
      journeyMessage.textContent = "You are a true burrito consideration master!";
    }
  }

  function triggerTestError() {
    try {
      throw new Error('Test error for PostHog error tracking');
    } catch (err) {
      // Capture the error in PostHog
      window.posthog?.captureException(err);
      console.error('Captured error:', err);

      // Show feedback to user
      const feedback = document.getElementById('error-feedback');
      feedback.style.display = 'block';
      setTimeout(() => {
        feedback.style.display = 'none';
      }, 3000);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;

    updateProfile();
    document.getElementById('error-btn')?.addEventListener('click', triggerTestError);
  });
</script>

```

---

