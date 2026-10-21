/**
 * Payment return page. The URL parameter is only a hint: this page asks the
 * server to verify the transaction with Paystack, and shows what the server says.
 */

import { useEffect, useState } from "react";
import { ApiFailure, factoryApi } from "./api";

export default function FactoryReturn() {
  const [state, setState] = useState<"verifying" | "done" | "error">("verifying");
  const [message, setMessage] = useState("Confirming your payment with Paystack…");
  const [plan, setPlan] = useState<string | null>(null);

  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get("reference") ?? "";
    if (!reference) {
      setState("error");
      setMessage("No payment reference was supplied.");
      return;
    }
    factoryApi
      .verifyPayment(reference)
      .then((result) => {
        setPlan(result.plan);
        setState("done");
        setMessage(result.message);
      })
      .catch((failure) => {
        setState("error");
        setMessage(failure instanceof ApiFailure ? failure.message : "We could not verify that payment.");
      });
  }, []);

  return (
    <div className="rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] p-8 text-center">
      <h1 className="font-['Space_Grotesk'] text-[22px] font-semibold text-white">
        {state === "verifying" ? "Verifying payment" : state === "done" ? "Payment confirmed" : "Payment not confirmed"}
      </h1>
      <p className="mx-auto mt-3 max-w-[520px] font-['Inter'] text-[13px] leading-[1.8] text-[#94A3B8]">{message}</p>
      {plan ? <p className="mt-2 font-['Inter'] text-[12px] text-[#86EFAC]">Your plan is now {plan === "pro" ? "Pro" : plan}.</p> : null}
      <div className="mt-6 flex justify-center gap-3">
        <a href="/factory/" className="rounded-lg bg-white px-4 py-2 font-['Inter'] text-[13px] font-medium text-[#0B0B0D]">
          Go to your workspace
        </a>
      </div>
    </div>
  );
}
