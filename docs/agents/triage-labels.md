# Triage Labels

The triage skill names seven roles. Two categories say what kind of work an issue is, and five
states say where the issue has got to. This file maps each role to the label string used in the
Linear workspace.

## Category roles

Every triaged issue carries exactly one category role.

| Label in mattpocock/skills | Label in our tracker | Meaning                     |
| -------------------------- | -------------------- | --------------------------- |
| `bug`                      | `Bug`                | Something is broken        |
| `enhancement`              | `Improvement`        | New feature or improvement |

## State roles

Every triaged issue also carries exactly one state role.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Whoever applies `ready-for-human`, whether the triage skill, a quick state override or a person in Linear, writes one line in the ticket's brief saying why the work stays with a person, such as a design call, hardware on someone's desk or a test by hand. An agent applying it in a quick override asks for that reason along with the label.

An agent asked to implement a ticket labelled `ready-for-human`, through `/implement` or any other way, stops before changing code. It says the label is there, gives the reason the ticket's brief gives for keeping the work with a person, and asks whether to go ahead. When the brief gives no reason, it says that too. A yes covers that ticket in that session only.

`Feature` is also a workspace label. Triage does not apply it; people use it by hand for new work.

Edit the right-hand column to match whatever vocabulary you actually use.
