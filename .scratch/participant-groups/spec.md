# Spec: participant groups

Written on Wed 4 Nov 2026. It follows Mr Tan's brief of 3 Nov and Adam's message to Mr Tan and Mr Johari. This spec covers that message's points 1 and 2. Point 3, the game, has its own tickets.

Mr Johari replied on 4 Nov asking for a few variations: one that meets the criteria the client asked for, and an extension based on what was discussed. The client is Julian, so variation 1 is the token game, which is the minimum for the trial on Thu 5 Nov at 9 am. This spec is variation 2, which comes after it, and it must also work for someone with no token.

New words, which `CONTEXT.md` gains when this is built:

- **Group**: a set of participants at one event, made by organizers. A participant is in at most one group. It isn't a hackathon team or a capstone group, which passport links also call a "group".
- **Joining**: a participant telling the event they're here, so they can be put in a group. It doesn't replace the Portal's check-in.
- **Allocation**: placing joined participants in groups, either all together when an organizer starts it, or one at a time after that.
- **Latecomer**: a participant who joins after allocation has started.

## Problem statement

An organizer has a room of people who need splitting into groups for an activity. The numbers aren't known until the day. They rarely divide evenly, and people keep arriving after the split. Doing this by hand takes time and leaves people standing around, and every late arrival means working out again who goes where.

A participant, meanwhile, has no quick way to find out which group they're in, who else is in it or where to go.

GeekyKey's token has no part in this today. Mr Tan's brief doesn't give it one.

## Solution

Organizers get a Groups screen in the existing organizer console. They create groups, each with a name, tags, a location and an optional capacity. When they're ready, they press Allocate, and the app splits everyone who has joined into those groups at random. From then on, each latecomer goes straight into the smallest group with room. Organizers can move or remove anyone by hand.

There's also a shortcut, which Adam suggested to the team on 5 Nov (BAC-138). Once people have joined, an organizer opens a form on the Groups screen and enters the number of groups, the people per group and a location for each group. One press makes the groups and allocates everyone who has joined. It works only while there are no groups.

A participant taps their token with their phone and presses the event's button on the token page, as they do today. That logs them in to the event and joins them. The dashboard then shows that they're waiting, and after allocation shows their group, its location and the other members' names.

## User stories

Creating and managing groups:

1. As an organizer, I want to create a group with a name, so that participants can tell groups apart.
2. As an organizer, I want to add tags to a group, so that I can label what it's for, such as "Mixer" or "Year 1".
3. As an organizer, I want to give a group a location, so that its members know where to go.
4. As an organizer, I want to give a group an optional capacity, so that a small room doesn't get too many people.
5. As an organizer, I want groups of different capacities in one event, so that uneven rooms and activities work.
6. As an organizer, I want to leave capacity empty, so that a group can take any number of people.
7. As an organizer, I want two groups refused the same name, so that participants can't confuse them.
8. As an organizer, I want to edit a group at any time, so that I can respond to changes on the day.
9. As an organizer, I want to lower a group's capacity without anyone being moved out, so that nobody is sent somewhere new without my choosing it.
10. As an organizer, I want to delete a group, so that I can drop one I no longer need.
11. As an organizer, I want a deleted group's members returned to the waiting list, so that nobody is lost.
12. As an organizer, I want deleting a group with members to ask me first, so that I don't do it by accident.

Allocating:

13. As an organizer, I want to see how many participants have joined, so that I know when to start.
14. As an organizer, I want to see the numbers update without reloading, so that I can watch people arrive.
15. As an organizer, I want one button that allocates everyone waiting, so that splitting a room takes seconds.
16. As an organizer, I want participants placed in random order, so that friends who arrive together don't all end up together.
17. As an organizer, I want an even number of participants split evenly, so that groups are fair.
18. As an organizer, I want an odd number split with sizes at most one apart when capacity allows, so that odd numbers still work.
19. As an organizer, I want Allocate refused with no groups, so that I know to create some first.
20. As an organizer, I want Allocate refused when there are fewer than 2 participants for each group, so that nobody is put in a group alone.
21. As an organizer, I want to see how many more participants that refusal needs, so that I can wait or delete a group.
22. As an organizer, I want every group with room filled before any group goes over capacity, so that rooms overfill only when they must.
23. As an organizer, I want anyone who doesn't fit to overflow into the smallest group, so that nobody is left without a group.
24. As an organizer, I want to press Allocate again, so that anyone on the waiting list, such as a deleted group's members, is placed with no extra steps.
25. As an organizer, I want pressing Allocate again to leave placed participants where they are, so that groups don't reshuffle after people have met.

Latecomers:

26. As an organizer, I want each latecomer placed automatically, so that I don't need to stop and deal with them.
27. As an organizer, I want a latecomer placed in the smallest group with room, so that groups stay balanced.
28. As an organizer, I want a latecomer to overflow into the smallest group when every group is full, and the screen to show it's over capacity, so that I can add room or move someone.
29. As an organizer, I want many people joining at once to be placed correctly, so that a rush at the door doesn't overfill a group or put anyone in two groups.

Moving people by hand:

30. As an organizer, I want to assign a waiting participant to a group, so that I can make exceptions.
31. As an organizer, I want to assign participants before pressing Allocate, so that I can fix a few places and let the app do the rest.
32. As an organizer, I want to move a participant to another group, so that I can fix a problem on the day.
33. As an organizer, I want to send a participant back to the waiting list, so that I can place them later.
34. As an organizer, I want to place someone in a full group, with the screen showing it's over capacity, so that my judgement can overrule the limit.
35. As an organizer, I want to remove someone who has left, so that they don't count toward a group's size.
36. As an organizer, I want a group with fewer than 2 members flagged, so that I can spot anyone left alone.

Running repeat trials:

37. As an organizer, I want to reset the allocation and keep the groups, so that I can run another timed trial with the same set-up.
38. As an organizer, I want reset to ask me first, so that I don't clear a live event by accident.
39. As an organizer, I want each person's join time, placement time and how they were placed on the screen, so that the report can measure time to group.
40. As an organizer, I want those details as a CSV, so that I can keep each trial's results before resetting.

Participants:

41. As a participant, I want tapping my token and opening the event to join me, so that the token is all I need.
42. As a participant, I want a Join button if I reached the event some other way, so that I'm not stuck if I logged in with Google directly or was reset.
43. As a participant, I want to see that I'm waiting, so that I know the app has me and I don't need to do anything else.
44. As a participant, I want my group to appear without reloading, so that I find out as soon as I'm placed.
45. As a participant, I want to see my group's name, tags and location, so that I know where to go.
46. As a participant, I want to see my group members' names, so that I can find them.
47. As a participant, I want my new group to show if an organizer moves me, so that I don't go to the wrong place.
48. As a participant, I want to be told when there's no group to put me in yet, so that I know to ask an organizer.
49. As a guest, I want to be asked for my name, so that my group sees it rather than "Guest".
50. As a participant, I want other people's user IDs kept from my screen, so that the group shows only what it needs to.
51. As a participant, I want to see only my own group's members, so that the screen stays simple and other people's details stay private.
52. As an organizer account, I want to be kept out of allocation, so that staff don't take up a participant's place.

The shortcut (BAC-138):

53. As an organizer, I want to enter a number of groups, the people per group and a location for each group, and have the groups made and filled in one press, so that splitting a room takes one form.
54. As an organizer, I want the shortcut refused while any group exists, so that it can't overwrite a live board.
55. As an organizer, I want a refused shortcut to leave nothing behind, so that I can send the same form again once enough people have joined.

Connections across groups (BAC-140):

56. As an organizer, I want to choose whether a connection needs different token kinds or different groups, so that being placed in a group decides who participants go and meet.
57. As an organizer, I want to change that choice during a session with no deploy, so that one trial can try both.
58. As a participant, I want to be told when someone is in my own group, or when one of us has no group yet, so that I know why we didn't connect.

## Implementation decisions

### Modules

- **A new groups module in the Event Service's base.** Its interface is small: join a user, allocate everyone waiting, assign or remove a user, reset, and read the board or one user's group. All the placement rules live here, and the routes hold none. It isn't a game in the `Game` sense, because it doesn't judge station taps.
- **Routes for participants and organizers,** which use the existing session and role checks and the existing organizer text limits.
- **The GeekyKey Service, the hand-off, the stations and the firmware don't change.** The token page's event button and the login link are already the way in.
- **A Groups screen in the organizer console,** beside Stations.
- **A group card at the top of the participant dashboard.** A login link lands there.
- **The screens' mock client** gains the same endpoints, as it has for the others.

### Placement rules

- Bulk allocation shuffles the waiting list, then places each person in the group with the fewest members that still has room. If no group has room, the person overflows into the group with the fewest members. The earliest-created group wins a tie.
- A latecomer follows the same rule, without the shuffle.
- Nobody waits after allocation has started unless there are no groups, or an organizer sent them back, or their group was deleted.
- Pressing Allocate never moves anyone already placed, so it can be pressed repeatedly.
- Allocate is refused when the number of joined participants is below twice the number of groups. Later arrivals and manual assignments aren't refused.
- Pressing Allocate the first time starts allocation. Until then a joining participant waits. Afterwards a joining participant is a latecomer.
- Nothing rebalances by itself. Deleting a group, removing a person or changing a capacity changes only what the organizer asked for, and the waiting list empties at the next Allocate.
- An organizer's manual assignment may pass a capacity. The board shows any group over its capacity, however it got there.
- Joining is idempotent. A participant who has already joined keeps their place.

### The shortcut

Adam agreed these rules on 5 Nov (BAC-138).

- The form takes the number of groups and the people per group, each a whole number above 0, and an optional location for each group, which follows a group's location rule.
- It makes the groups named "Group 1", "Group 2" and so on, oldest first in that order. Each has the people per group as its capacity and no tags.
- It then allocates by the placement rules above, so 5 joined in 2 groups of 2 gives sizes 3 and 2, and the board shows the first over capacity.
- The service refuses it while any group exists, and makes nothing. Changing the numbers between trials means deleting the groups first, because Reset keeps them.
- The service also refuses it, making nothing, when fewer than 2 have joined for each group, with Allocate's `too_few_participants`. So people join before anyone uses it. The dialog's sentence ends "then press Split again", since pressing Allocate after a refused split would find no groups.
- The service does the whole step in one transaction under the allocation lock. A refusal leaves nothing behind, so a retry can't fail on group names that already exist. Of two organizers pressing at once, the second finds the first's groups and is refused.
- The screen shows locations for up to 30 groups. The rest get theirs from each group's menu afterwards, so a mistyped large number doesn't draw hundreds of fields.

### Connections across groups

Adam asked for this on 5 Nov (BAC-140). Variation 1, the token game, keeps its rule, and variation 2 can use the new one. Kinds stay, since Julian asked for them (ADR 0006).

- The Groups screen has two choices: "Connect across token kinds", which a new event starts on, and "Connect across groups". Only organizers change it.
- The choice is one row in `event_settings`, so every instance reads the same one and a restart keeps it. The evening-before clear empties it, so the next event starts on token kinds.
- Across groups, two people placed in different groups connect, whatever their tokens' kinds, including tokens with no kind. Two in the same group get `same_kind`, which the token page already words as "You're in the same group". Someone not placed, because they haven't joined or are waiting, gets the new `no_group`, and no half is kept.
- Each tap reads the choice and both people's groups at the start of its transaction, before any lock, so it's judged as things were at that tap.
- Connections already made stay when the choice changes, when someone moves, and after a Reset. A connection's kinds may be null, which only a connection across groups has.

### Concurrency

Cloud Run may run several instances, so a lock in memory isn't enough. A single allocation row holds whether allocation has started. Every write that changes who is in a group takes `FOR UPDATE` on that row first, in a transaction, then reads the counts. Writes take turns, which is fast enough for an event of a few hundred people.

### Schema

Migration 0019 only adds tables, because the deploy migrates before the new code is live.

- `participant_groups`: ID, unique name, tags as a JSON list, location, nullable capacity, created time. `groups` is avoided because MySQL reserves it.
- `group_members`: user ID as primary key, which makes groups disjoint; nullable group ID, null while waiting; joined time; nullable placed time; `how` as `allocated`, `latecomer` or `organizer`.
- `group_allocation`: one row, with a nullable started time.

The evening-before clear's lists must name all three, or their test fails. `group_members` and `group_allocation` are cleared, and `participant_groups` is kept with the event's other settings.

### API shapes (drafts for agreement 0.14)

Names follow the agreement's conventions. Text fields follow the organizer limit of 80 code points, tags allow at most 5 items, and capacity is a positive integer or null.

Participant, any logged-in user unless noted:

- `GET /api/v1/me/group` answers `{ "status": "not_joined" | "waiting" | "placed", "allocation_started": boolean, "group": null | { "id", "name", "tags", "location", "members": [{ "display_name" }] } }`. It never gives another user's ID. An organizer gets `not_joined`.
- `POST /api/v1/me/group` joins, and answers as the GET does. It answers `403 forbidden` for an organizer.

Organizer:

- `GET /api/v1/admin/groups` answers `{ "allocation_started_at", "joined_count", "groups": [{ "id", "name", "tags", "location", "capacity", "members": [{ "user_id", "display_name", "joined_at", "placed_at", "how" }] }], "waiting": [{ "user_id", "display_name", "joined_at" }] }`.
- `POST /api/v1/admin/groups` creates a group and answers `201` with it, or `409 name_taken`.
- `PUT /api/v1/admin/groups/{id}` sets all its fields, or answers `404 not_found` or `409 name_taken`.
- `DELETE /api/v1/admin/groups/{id}` returns its members to waiting.
- `POST /api/v1/admin/groups/allocate` answers with the board, or `409 no_groups`, or `409 too_few_participants` with `needed`.
- `PUT /api/v1/admin/groups/members/{user_id}` takes `{ "group_id": string | null }`, where null means waiting, and adds the user if they haven't joined. It answers `404 not_found` when the group or the user doesn't exist.
- `DELETE /api/v1/admin/groups/members/{user_id}` removes them. They can join again.
- `POST /api/v1/admin/groups/reset` empties the members and un-starts allocation, and keeps the groups.
- `POST /api/v1/admin/groups/split` takes `{ "group_count": integer, "people_per_group": integer, "locations"?: (string | null)[] }`, with at most one location for each group, and a missing or blank one as none. It makes the groups and allocates, and answers `201` with the board. It answers `409 groups_exist` while any group exists, or `409 too_few_participants` with `needed`, and makes nothing either way.
- `GET /api/v1/admin/groups/export.csv` gives each member's group, join time, placed time and how they were placed.

- `PUT /api/v1/admin/connections/rule` takes `{ "connect_across": "token_kinds" | "groups" }` and answers 200 with it (BAC-140). The board gains `connect_across`.
- The meeting hand-off gains the status `no_group`, and `/me`'s `connections[].kind` may be null (BAC-140).

Errors otherwise follow the agreement: `unauthenticated`, `forbidden`, `validation_failed` and `rate_limited`.

### Screens

- **Joining.** The dashboard posts the join once when it arrives through a login link. Anywhere else it shows a Join button when the status is `not_joined`. That way, someone looking at the dashboard from home isn't counted as present.
- **Polling.** The participant's card polls every 5 seconds until placed, then every 15. The Groups screen polls every 5 seconds. Both stay inside the user limit in the agreement's Rate limits section.
- **Names.** The dashboard uses the existing name prompt while `has_name` is false.
- **Organizer actions.** Deleting a group with members and resetting each ask for confirmation, with the existing dialog pattern.
- **Wording.** New sentences go in section 13 of the agreement, for example for waiting and each refusal.

## Testing decisions

A good test here sends requests and checks what comes back, as a screen would. It doesn't reach into tables or private functions to check how a placement happened.

There's one backend seam: the Event Service's HTTP routes through the existing test app, against the test database. Existing prior art is the route tests for `me`, `admin` and the QR fallback, with their fixture and fake clock. The existing check of responses against the screens' schemas covers the new shapes too.

The backend tests cover the brief's scenarios:

| Scenario | Set-up | Expected |
|---|---|---|
| Even | 12 people, 3 groups | Sizes 4, 4, 4 |
| Odd | 13 people, 3 groups | Sizes 5, 4, 4 |
| Uneven capacities | 8 people, capacities 2 and 6 | Sizes 2 and 6 |
| Over capacity | 8 people, capacities 3 and 3 | Sizes 4 and 4, nobody waiting |
| Room first | 9 people, capacities 2 and 4, and one group with none | Sizes 2, 4, 3 |
| Too few | 3 people, 2 groups | `409 too_few_participants`, `needed` 1 |
| Latecomers | After allocation, groups of 3 and 2 | The next person joins the group of 2 |
| Everyone full | After allocation, groups of 3 and 2, both at capacity | The next person joins the group of 2 |
| Allocate again | After deleting a group | Its members placed, others unmoved |
| Rush | 20 joins at once after allocation, 3 groups with capacity 5 | Nobody in two groups, nobody waiting, sizes 7, 7, 6 |
| Reset | After allocation | Groups kept, nobody joined, status `not_joined` |
| Shortcut, even | 4 people, 2 groups of 2 | "Group 1" and "Group 2", sizes 2, 2 |
| Shortcut, over capacity | 5 people, 2 groups of 2 | Sizes 3, 2, the first over capacity |
| Shortcut, too few | 3 people, 2 groups | `409 too_few_participants`, `needed` 1, no groups; the same form works after a fourth joins |
| Shortcut, groups there | 1 group, 6 people | `409 groups_exist`, nothing made or placed |
| Shortcut, at once | Two presses on two instances | One `201`, one `409 groups_exist`, one set of groups |
| Across groups | Two people in different groups, tokens with no kind | Connected, and `/me` lists it with `kind` null |
| Across groups, same group | Two people in one group, different kinds | `same_kind`, no connection |
| Across groups, no group | One person waiting or not joined | `no_group`, no half kept |
| Switch mid-session | A move between the two halves | Judged by the groups at the second half |

The rest of the backend tests cover roles (a participant is refused every organizer route), privacy (a participant's answer has no user IDs and only their own group), manual moves past capacity, deleting a group, and the CSV.

On the screens, the tests follow the existing feature tests over the mock client. They check the Groups screen's actions and refusals, and the card's three states. They also check the join on a login link's arrival, and that an ordinary visit shows the button instead.

The end-to-end test is a run with real phones and tokens on the deployed service.

## Out of scope

- The game a group plays, including anything further on connections and the answers game (point 3 of the message), apart from connecting across groups (BAC-140).
- Other token uses Julian suggested: voting, leaving a contact and sponsor booths.
- Showing a group on a station's screen. HAR-28, the firmware's two lines, is still in the backlog.
- Grouping by token kind. ADR 0006 lets an event decide what a kind means, so this can come later, but allocation here ignores kind.
- Colour-coded tokens, lights, sounds, animations and cross-event tokens, which Mr Tan put in v2+.
- GitHub login and the Portal. Firebase stays as it is (ADR 0004).
- Several events on one Event Service, or several rounds of groups at once. One service runs one event, with one set of groups.
- Automatic rebalancing, and any choice of groupmates by participants.
- Forming hackathon teams, which Julian says is quick already.

## Further notes

### The order of work

Variation 1 comes first, so none of this is due for the 9 am trial. BAC-125's sub-issues follow this order. The first three are the minimum that can be demonstrated. Cut from the bottom.

1. The backend, without the CSV.
2. The Groups screen.
3. The participant's card, with the join on arrival and the Join button, so that the variation without a token works.
4. The name prompt on the dashboard.
5. The CSV. If it's cut, copy the times from the screen or use a stopwatch.

### Decisions Adam confirmed on 4 Nov

- **"N/X >= 2"** in the 3 Nov notes means at least 2 participants for each group, checked when an organizer presses Allocate.
- **"Label (tags)"** means a name plus optional free-text tags, which are shown but don't change how allocation works.
- **Over capacity** overflows into the smallest group rather than holding people on a waiting list.

Tapping the token to see your group is still our own proposal, not something Mr Tan or Julian asked for.

### Before using it with people

- The rest of the dashboard and passport stay as they are, including their grad tea content. Decide whether that distracts anyone.
- Merging to `main` deploys production and runs the migration.

### Conflicts to raise

BAC-126 covers the agreement, the migration spec and `CONTEXT.md`, which don't describe this direction yet. This spec's shapes are drafts, so the backend PR lists them for the agreement's next version, and Ethan approves that version.
