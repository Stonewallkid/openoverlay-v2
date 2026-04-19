# OpenOverlay v2 - Development TODO

## Phase 1: Foundation (Current)
- [x] Project structure setup
- [x] TypeScript configuration
- [x] State management system
- [x] API client structure
- [x] UI component architecture (Web Components)
- [x] Canvas module skeleton
- [x] Game module skeleton
- [x] Background script skeleton
- [ ] Get Vite build working
- [ ] Test extension loads in Chrome

## Phase 2: Core Drawing
- [ ] Freehand drawing with all brush styles
- [ ] Text graffiti placement
- [ ] Eraser tool
- [ ] Undo/redo
- [ ] Save drawings to local storage (offline-first)
- [ ] Render saved drawings on page load

## Phase 3: Backend Setup
- [ ] Set up backend project (Node.js + Express or Hono)
- [ ] PostgreSQL database schema
- [ ] User authentication (Google OAuth)
- [ ] JWT token handling
- [ ] Basic CRUD for drawings
- [ ] Deploy to Railway/Render

## Phase 4: Social Features
- [ ] User profiles
- [ ] Follow/unfollow users
- [ ] Content visibility (public/followers/private)
- [ ] Feed: content from followed users
- [ ] User toggle: show/hide specific users' content

## Phase 5: Annotations
- [ ] Text selection highlighting
- [ ] Create annotation with note
- [ ] Comment threads on annotations
- [ ] Re-anchoring when page changes

## Phase 6: Game
- [ ] Port physics engine from v1
- [ ] Character sprites (stick_guy, stick_girl, alien, robot)
- [ ] Course editor (start, flags, finish, hazards)
- [ ] Leaderboard per course
- [ ] Submit times to backend

## Phase 7: Monetization
- [ ] Stripe integration
- [ ] Tier-based feature gating
- [ ] Checkout flow
- [ ] Customer portal
- [ ] Webhook handling

## Phase 8: Polish
- [ ] Error handling and user feedback
- [ ] Loading states
- [ ] Offline support (sync when back online)
- [ ] Performance optimization
- [ ] Content moderation (report button)

## Future Ideas
- [ ] Custom brush packs (marketplace)
- [ ] Custom sprite uploads (Creator tier)
- [ ] Team/group annotations
- [ ] Browser action popup
- [ ] Mobile-friendly toolbar
- [ ] Export drawings as images
- [ ] Embed drawings on other sites
