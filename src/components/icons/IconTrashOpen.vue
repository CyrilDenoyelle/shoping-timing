<template>
  <svg
    width="18"
    height="18"
    viewBox="-1 -6 26 30"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <!-- couvercle soulevé (lid + poignée décalés et pivotés) -->
    <g transform="translate(2 -5) rotate(15 12 5)">
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </g>
    <!-- bord du corps -->
    <polyline points="3 6 5 6 21 6" />
    <!-- corps -->
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
</template>
