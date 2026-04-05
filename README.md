<h1 align="center">RiftApp</h1>

<p align="center">
  <br/>
  <b>Fast · Clean · Yours</b>
  <br/><br/>
  <i>Real-time communication, built for clarity and control.</i>
  <br/><br/>
</p>

<p align="center">
  <sub><b>Chat</b></sub>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <sub><b>Voice</b></sub>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <sub><b>DMs</b></sub>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <sub><b>Your infrastructure</b></sub>
</p>

<br/>

---

<br/>

## ⟨ What is RiftApp? ⟩

<table>
<tr>
<td width="33%" valign="top">

**For teams**

Bring people together without the clutter.

</td>
<td width="33%" valign="top">

**For communities**

A home that scales from a few friends to a crowd.

</td>
<td width="33%" valign="top">

**For you**

Self-host so **your** conversations stay **your** business.

</td>
</tr>
</table>

<br/>

**RiftApp** is a communication home for teams and communities: **chat**, **voice**, **DMs**, and **shared spaces** in one calm, fast experience. Host it yourself so **your conversations and files stay on your terms**, not someone else’s product roadmap.

> *We believe great software should feel **light**, **responsive**, and **yours**.*

RiftApp is built for people who want the energy of a modern community app **without** the noise, lock-in, or clutter.

<br/>

---

<br/>

## ⟨ Why teams choose it ⟩

| | |
|:--|:--|
| **Speed that keeps up** | Typing, sending, and switching contexts stay snappy so the room never feels sluggish. |
| **Spaces that make sense** | Organize people around **hubs**, **streams**, and **voice** without drowning in nested menus. |
| **Privacy by placement** | Run it on infrastructure **you** control. You decide who has access and where data lives. |
| **Room to grow** | From a tight friend group to a growing community, invites, friends, and moderation tools scale with you. |

<br/>

<p align="center">
  <i>Creative crews · Gaming circles · Internal squads · Your crew here</i>
</p>

<p align="center">
  RiftApp is meant to feel like <b>your</b> place on the internet.
</p>

<br/>

---

<br/>

## ⟨ Everything in one place ⟩

<br/>

> **Your community, structured**  
> Create hubs for each group, split topics into streams, and hop into voice when text is not enough.

<br/>

> **Talk the way you want**  
> Public streams, side threads, and private DMs side by side, so nothing important gets lost in the shuffle.

<br/>

> **Show up fully**  
> Profiles, avatars, and shared media help people recognize each other and celebrate the group’s personality.

<br/>

> **Stay in control**  
> Invites you can share or limit, friend connections you manage, and ranks so trusted members can help keep things healthy.

<br/>

> **Hear each other clearly**  
> Drop into voice streams when you need nuance, speed, or just human tone.

<br/>

---

<br/>

## ⟨ Words we use ⟩

We use clear names so the app feels **intentional**, not borrowed.

| You might say… | In RiftApp |
|:--------------:|:----------:|
| Server | **`Hub`** |
| Channel | **`Stream`** |
| Voice channel | **`Voice stream`** |
| Roles | **`Ranks`** |

<br/>

---

<br/>

## ⟨ Under the hood ⟩

<table>
<tr>
<td>

**Self-hostable**

Run it where you want.

</td>
<td>

**Extensible**

Room for your team to ship alongside it.

</td>
<td>

**Documented**

Technical depth lives in **[ARCHITECTURE.md](ARCHITECTURE.md)** (diagrams, data model, implementation).

</td>
</tr>
</table>

<br/>

---

<br/>

## ⟨ Try it locally ⟩

<details>
<summary><b>Prerequisites &amp; first-time setup</b> (click to expand)</summary>

<br/>

**You will need:** Go, Node.js, and Docker for a full local stack. See `backend/go.mod` and your environment for exact versions.

**Environment file:**

```bash
cp backend/.env.example backend/.env
```

Adjust `backend/.env` for secrets, URLs, and storage before you bring services up.

<br/>

</details>

<br/>

**Full stack (Compose)**

```bash
docker compose -f backend/compose.yml --env-file backend/.env up --build
```

<br/>

<details>
<summary><b>Day-to-day development</b> (click to expand)</summary>

<br/>

*Infra in the background:*

```bash
docker compose -f backend/compose.yml --env-file backend/.env up postgres redis minio -d
```

*API:*

```bash
cd backend
go mod tidy
go run ./cmd/riftapp
```

*App shell:*

```bash
cd frontend
npm install
npm run dev
```

The dev UI is typically at **`http://localhost:5173`**, with the API proxied from the frontend config.

<br/>

</details>

<br/>

---

<br/>

## ⟨ Project layout ⟩

| Path | What lives there |
|:-----|:-----------------|
| **`backend/`** | API, auth, real-time messaging, migrations, and `compose.yml` for local dependencies |
| **`frontend/`** | Web client |
| **`ARCHITECTURE.md`** | Technical deep dive for builders |

<br/>

---

<br/>

## ⟨ License ⟩

<p align="center"><i>Private. All rights reserved.</i></p>
