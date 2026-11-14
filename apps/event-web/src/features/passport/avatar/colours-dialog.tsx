import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AvatarColourPicker } from "@/features/passport/avatar/avatar-colour-picker";

/**
 * The character and colours again, for a guest who skipped them at the name prompt or wants a
 * change.
 */
export function ColoursDialog({ userId }: { userId: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Change look</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Your look</DialogTitle>
          <DialogDescription>
            Your avatar changes as you pick. Anyone who taps your token, or whose token you tap,
            sees it.
          </DialogDescription>
        </DialogHeader>
        <AvatarColourPicker userId={userId} />
      </DialogContent>
    </Dialog>
  );
}
