"use client";

import { useRef } from "react";

type Props = {
  userId: string;
  uploadAction: (formData: FormData) => Promise<void>;
};

export function OnboardingAvatarUpload({ userId, uploadAction }: Props) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={uploadAction} encType="multipart/form-data">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="returnTo" value="/onboarding/companion" />
      <input
        type="file"
        name="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="max-w-xs text-sm"
        onChange={(e) => {
          if (e.target.files?.length) formRef.current?.requestSubmit();
        }}
      />
    </form>
  );
}
