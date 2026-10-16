'use client';

export function PaymentAmountInput({ amount }: { amount: number }) {
  return <input name="amount" type="text" inputMode="numeric" defaultValue={amount.toLocaleString('en-US')} required pattern="[0-9]+(,[0-9]{3})*" onInput={e => {
    const input = e.currentTarget;
    input.setCustomValidity('');
    if (!/^[0-9,]*$/.test(input.value)) return;
    const digitsBeforeCaret = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/,/g, '').length;
    const digits = input.value.replace(/,/g, '');
    input.value = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    let caret = 0, seen = 0;
    while (caret < input.value.length && seen < digitsBeforeCaret) {
      if (input.value[caret] !== ',') seen++;
      caret++;
    }
    input.setSelectionRange(caret, caret);
  }} />;
}
