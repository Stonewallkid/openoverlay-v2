# OpenOverlay Complete Feature Guide

This guide documents every button, option, and feature in OpenOverlay. Use this to create extended demo sequences for Smudgy.

---

## 1. FAB (Floating Action Button)

**Location**: Bottom-right corner of screen (pink circle with Smudgy icon)

**Action**: Click to expand the mini menu with 4 buttons

**Visual States**:
- Default: Pink with Smudgy face
- Highlighted (onboarding): Green with glow effect
- Expanded: Shows 4 mini buttons in a fan pattern

---

## 2. Mini Buttons (Fan Menu)

When FAB is clicked, 4 mini buttons appear in a fan pattern:

### 2.1 Draw Button (✏️)
**Position**: First button in fan (leftmost)
**Action**: Opens draw mode toolbar
**What it does**:
- Activates freehand drawing on the webpage
- Shows drawing toolbar with brushes, colors, sizes
- Drawings persist on the page and sync to cloud (if signed in)

### 2.2 Text Button (T)
**Position**: Second button in fan
**Action**: Opens text/emoji mode toolbar
**What it does**:
- Allows placing text stickers and emojis on the page
- Type custom text or pick from emoji grid
- Text can be styled (normal, bold, italic, outline)

### 2.3 Game Button (🎮)
**Position**: Third button in fan
**Action**: Opens game mode toolbar
**What it does**:
- Spawns your stick figure character
- Access multiplayer, tag game, and race modes
- Build race courses with checkpoints and obstacles

### 2.4 Profile Button (👤)
**Position**: Fourth button (rightmost)
**Action**: Opens profile modal
**What it does**:
- Sign in/out with Google
- Customize your character (colors, hat, accessories)
- Manage drawing visibility settings
- View followers/following
- Access bookmarks
- Send feedback

---

## 3. Draw Mode Toolbar

### 3.1 Brush Styles (Row 1)

| Button | Name | Description |
|--------|------|-------------|
| ● | Solid | Standard solid brush stroke |
| ○ | Outline | Hollow brush, draws outlines only |
| ••• | Dots | Dotted/stippled brush pattern |
| ≋ | Spray | Spray paint effect, dispersed particles |
| ～ | Glow | Neon glow effect with soft edges |

### 3.2 Tools (Row 1 continued)

| Button | Name | Description |
|--------|------|-------------|
| 🧹 | Eraser | Erase parts of drawings |
| ⬇️ | Background | Draw BEHIND game character (lower layer) |
| ⬆️ | Foreground | Draw IN FRONT of game character (upper layer) |

### 3.3 Shape Tools (Row 2)

| Button | Name | Description |
|--------|------|-------------|
| ✏️ | Freehand | Default - draw freely with mouse/finger |
| ― | Line | Draw straight lines |
| □ | Rectangle | Draw rectangles/squares |
| ○ | Circle | Draw circles/ellipses |
| △ | Triangle | Draw triangles |
| ☆ | Star | Draw 5-pointed stars |
| ♥ | Heart | Draw heart shapes |
| ◧ | Fill Toggle | Toggle between outline and filled shapes |

### 3.4 Color Controls (Row 3)

| Element | Description |
|---------|-------------|
| Color Picker | Click to open full color palette |
| Quick Colors | 8 preset color swatches for fast selection |

**Quick Color Palette**:
- Red (#ff3366)
- Orange (#ff9933)
- Yellow (#ffcc00)
- Green (#33cc33)
- Cyan (#00cccc)
- Blue (#3366ff)
- Purple (#9933ff)
- Pink (#ff69b4)

### 3.5 Size & Opacity (Row 4)

| Control | Range | Default | Description |
|---------|-------|---------|-------------|
| Size Slider | 1-150px | 24px | Brush/stroke thickness |
| Opacity Slider | 10-100% | 100% | Transparency of strokes |

### 3.6 Action Buttons (Row 5)

| Button | Name | Description |
|--------|------|-------------|
| ↩ | Undo | Remove last drawing action |
| 🗑 | Clear | Delete all drawings (mode-aware) |
| Cancel | Cancel | Close toolbar without saving |
| Save | Save | Save drawings and close toolbar |

---

## 4. Text Mode Toolbar

### 4.1 Emoji Picker

**Button**: 😀 (opens emoji grid)
**Grid Contents**: 80+ emojis organized by category
- Faces & Emotions
- Gestures & People
- Animals & Nature
- Food & Drink
- Activities & Sports
- Objects & Symbols

### 4.2 Text Input

**Field**: Text input box
**Placeholder**: "Type or pick emoji..."
**Behavior**:
- Type text, it appears in center of screen
- Click and drag to reposition
- Text updates live as you type

### 4.3 Text Styles

| Button | Style | Description |
|--------|-------|-------------|
| A | Normal | Standard text |
| **B** | Bold | Bold weight text |
| *I* | Italic | Italicized text |
| A̲ | Underline | Underlined text |
| [A] | Outline | Text with outline/stroke |

### 4.4 Layer Controls

| Button | Description |
|--------|-------------|
| ⬇️ | Place text behind character |
| ⬆️ | Place text in front of character |

### 4.5 Placement Hint

**Text**: "Click page to place (default: regular layer)"
**Behavior**: Click anywhere on page to place current text/emoji

---

## 5. Game Mode Toolbar

### 5.1 Play Mode Buttons (Row 1)

| Button | Name | Requires Sign-in | Description |
|--------|------|------------------|-------------|
| 👥 MP | Multiplayer | Yes | Sync window size, see other players |
| 🏷️ Tag | Tag Game | Yes | Play tag with other players online |
| 🏃 Race | Race Mode | No | Race on custom courses with checkpoints |

### 5.2 Build Tools (Row 2)

Used for creating race courses:

| Button | Tool | Description |
|--------|------|-------------|
| ✋ | Select | Select and move placed objects |
| 👤 | Spawn | Set player spawn point |
| 🏁 | Start | Place race start line |
| 🏆 | Finish | Place race finish line |
| 🚩 | Checkpoint | Place checkpoint flags |
| 🔶 | Trampoline | Bouncy pad - launches player upward |
| 💨 | Speed Boost | Gives temporary speed increase |
| 🦘 | High Jump | Enables extra jump height |
| 🔺 | Spike | Hazard - kills player on contact |

### 5.3 Action Buttons (Row 3)

| Button | Description |
|--------|-------------|
| ↩ | Undo last placed object |
| 🗑 | Clear all course objects |
| ✕ | Cancel and exit game mode |
| ✓ | Save course and start playing |

---

## 6. Profile Modal

### 6.1 Sign-In Section (Not signed in)

**Prompt**: "Sign in to save your drawings and follow other users +many more features"
**Button**: "Sign in with Google" (with Google logo)

### 6.2 Profile Header (Signed in)

- **Avatar**: Google profile picture
- **Name**: Display name from Google
- **Email**: Google email address

### 6.3 Game Name

**Field**: "Your Game Name"
**Max Length**: 12 characters
**Placeholder**: "Pick a nickname!"
**Purpose**: Name shown above your character in multiplayer

### 6.4 Stats

| Stat | Description |
|------|-------------|
| Followers | Number of people following you |
| Following | Number of people you follow |

**Click behavior**: Opens followers/following panel

### 6.5 Bio Section

**Click to edit** - Opens textarea
**Max Length**: 150 characters
**Purpose**: Personal description shown on profile

### 6.6 Character Settings

#### Character Type
| Button | Description |
|--------|-------------|
| 👦 Boy | Male stick figure with mohawk hair |
| 👧 Girl | Female stick figure with bob hair and dress |

#### Body Part Color Selection

Select which part to color:
| Button | Part | Description |
|--------|------|-------------|
| 🦴 Body | Body color (main outline color) |
| ⚪ Head | Head/face fill color |
| 🩷 Face | Smudgy face accent color (pink circle) |
| 💇 Hair | Hair color |
| 👗 Dress | Dress color (girl only) |

#### Color Swatches
Grid of 24 colors to choose from for selected body part.

#### Hat Selection

| Option | Description |
|--------|-------------|
| None | No hat |
| 🧢 Cap | Baseball cap (red) |
| 🎩 Top Hat | Formal black top hat |
| 👑 Crown | Golden crown with jewels |
| 🧶 Beanie | Blue winter beanie with pom-pom |
| 🎉 Party | Pink party cone hat |

#### Face Accessories

| Option | Description |
|--------|-------------|
| None | No face accessory |
| 👓 Glasses | Round glasses |
| 🕶️ Sunglasses | Cool dark sunglasses |
| 🥸 Mustache | Handlebar mustache |
| 🧔 Beard | Full beard |
| 😷 Mask | Face mask |

#### Respawn Toggle

**Toggle**: "Respawn in explore"
**Default**: ON
**Purpose**: Auto-respawn when falling off screen in explore mode

### 6.7 Drawing Visibility Settings

| Toggle | Default | Description |
|--------|---------|-------------|
| Show all drawings | ON | Master toggle - hide all drawings |
| My drawings | ON | Show/hide your own drawings |
| Only people I follow | OFF | Only show drawings from followed users |

### 6.8 Contributors Section

**List**: Shows other users who have drawn on current page
**Info per user**: Avatar, display name
**Action**: Click to view profile (follow/unfollow)

### 6.9 Race Course Settings

**Dropdown**: "Select course"
- My Course (default)
- Other users' courses (if available)

### 6.10 Bookmarks

**Header**: "Bookmarks" with count badge
**List**: Saved pages with drawings
**Action**: Click to navigate to bookmarked page

### 6.11 Feedback Section

**Badge**: "BETA"
**Dropdown**: Feedback type
- 🐛 Bug Report
- 💡 Feature Request
- 💬 Other Feedback

**Textarea**: Describe the issue or suggestion
**Button**: "Send Feedback"

### 6.12 Sign Out

**Button**: "Sign Out" (red/danger style)

---

## 7. Keyboard Controls (Game Mode)

| Key | Action |
|-----|--------|
| A / ← | Move left |
| D / → | Move right |
| W / ↑ / Space | Jump |
| S / ↓ | (Reserved) |

---

## 8. Tag Game Mechanics

### Starting Tag
- Click 🏷️ Tag button (requires sign-in)
- First player becomes "IT"
- Others join existing game

### Being IT
- "IT" indicator appears above your head
- Touch other players to tag them
- You become "not IT" when you tag someone

### No Tag Backs (NTB)
- After being tagged, 3-second cooldown
- Pie chart shows cooldown progress
- Can't be tagged again during cooldown

### Ending Tag
- Click Tag button again to leave
- Game continues for others

---

## 9. Race Mode Mechanics

### Building a Course
1. Enter Game mode
2. Place 🏁 Start line
3. Draw platforms (in Draw mode)
4. Place 🚩 Checkpoints
5. Place 🏆 Finish line
6. Add obstacles (spikes, trampolines, etc.)
7. Click ✓ to save and play

### Racing
- Countdown: 3, 2, 1, GO!
- Reach all checkpoints in order
- Cross finish line to complete
- Times saved to leaderboard

---

## 10. Multiplayer Sync

### Window Sync (MP Button)
- Resizes window to standard dimensions
- Ensures all players see same coordinates
- Required for accurate multiplayer positioning

### Player Visibility
- See other players as semi-transparent characters
- Names appear above heads
- Colors and customizations sync

### Drawing Sync
- Signed-in users' drawings sync to cloud
- Others can see your drawings
- Drawings persist on page reload

---

## 11. Layers System

### Three Drawing Layers

| Layer | Z-Index | Description |
|-------|---------|-------------|
| Background | Below character | Character walks IN FRONT of these |
| Normal | Same as character | Default layer |
| Foreground | Above character | Character walks BEHIND these |

### Collision
- All layers provide collision/platforms
- Character can walk on any drawing regardless of layer

---

## 12. Demo Sequence Ideas

### Short Demo (Current - 45 seconds)
1. Smudgy enters from left
2. Jumps on FAB (turns green)
3. Jumps on Draw button (activates)
4. Draws a line while running
5. Jumps on Profile button
6. Jumps on Explore button
7. "Your turn!" popup

### Extended Demo Ideas

#### Full Feature Tour (3-5 minutes)
1. Enter and greet
2. Show all 4 mini buttons
3. Demo draw mode:
   - Try each brush style
   - Draw shapes
   - Change colors
   - Adjust size/opacity
   - Use background/foreground layers
4. Demo text mode:
   - Type text
   - Add emojis
   - Style text
5. Demo game mode:
   - Show character moving
   - Jump on platforms
6. End with "explore together!"

#### Multiplayer Focus Demo
1. Show sign-in prompt
2. Demo character customization
3. Show MP button
4. Explain tag game
5. Show how players appear together

#### Creative Focus Demo
1. Draw elaborate scene
2. Use all brush types
3. Create layered art
4. Add text/emojis
5. Show final creation

---

## 13. Notifications & Popups

### Sign-in Reminder
- **When**: Every 4 hours if not signed in
- **Message**: "Sign in to share drawings with others"
- **Duration**: 3 seconds

### Multiplayer Blocked
- **When**: Click MP/Tag without sign-in
- **Message**: "[Feature] requires sign-in"
- **Duration**: 3 seconds

### Demo Over
- **When**: Onboarding completes
- **Message**: "Demo over! Your turn to draw!"
- **Duration**: 2.5 seconds

### Tag Notifications
- "You're IT!" - Tag someone!
- "You're not IT!" - Run away!
- "Tagged!" - [Player name]

---

## 14. Storage Keys (localStorage)

| Key | Purpose |
|-----|---------|
| oo_onboarding_complete | Onboarding finished |
| oo_onboarding_skipped | User skipped onboarding |
| oo_player_color | Main character color |
| oo_player_girl | Girl mode enabled |
| oo_player_hat | Current hat selection |
| oo_player_accessory | Current face accessory |
| oo_color_* | Body part colors |
| oo_explore_respawn | Respawn setting |
| oo_signin_reminder_last | Last sign-in reminder time |
| oo_drawing_[pageKey] | Saved drawings per page |

---

This guide covers all user-facing features in OpenOverlay v2.0.
