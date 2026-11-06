import { PencilSimple } from "@phosphor-icons/react";
import { useState } from "react";

import type { MeResponse } from "@/api/types";
import { SectionHeading } from "@/components/layout/section-heading";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProfileForm } from "@/features/passport/profile-form";

/**
 * The user's own bio and contact line, and a way to change them at any time (BAC-147). Like the
 * list of connections, it waits on `questions`, since an event with no connections game has nobody
 * to show them to. The form is in a dialog, so a poll of /me can't reset what's being typed.
 */
export function ProfileSection({ me }: { me: MeResponse }) {
  const [open, setOpen] = useState(false);
  if (me.connections.length === 0 && me.questions === null) return null;
  const { bio, contact_line: contactLine } = me.user;
  return (
    <section>
      <SectionHeading title="Your profile" />
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-lg border px-3 py-3">
        <div className="min-w-0 space-y-1">
          {bio ? <p className="text-sm break-words">{bio}</p> : null}
          {contactLine ? <p className="text-sm break-words">Contact: {contactLine}</p> : null}
          {!bio && !contactLine ? (
            <p className="text-sm text-muted-foreground">
              No bio or contact line yet. Add them so people you connect with can reach you.
            </p>
          ) : null}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <PencilSimple aria-hidden />
            Change profile
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change profile</DialogTitle>
              <DialogDescription>What people see about you.</DialogDescription>
            </DialogHeader>
            <ProfileForm bio={bio} contactLine={contactLine} onSaved={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}
