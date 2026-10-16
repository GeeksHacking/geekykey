import { Plus } from "@phosphor-icons/react";
import { useState } from "react";

import type { CreateStationResponse } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { AddStationForm } from "@/features/stations/add-station-form";
import { StationKeyReveal } from "@/features/stations/station-key-reveal";

/** Two steps in one dialog: the form, then the one-time key. Closing clears the key from memory. */
export function AddStationDialog() {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<CreateStationResponse | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setCreated(null);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden />
          Create station
        </Button>
      </DialogTrigger>
      <DialogContent>
        {created ? (
          <StationKeyReveal result={created} onDone={() => handleOpenChange(false)} />
        ) : (
          <AddStationForm onCreated={setCreated} />
        )}
      </DialogContent>
    </Dialog>
  );
}
