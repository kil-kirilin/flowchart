<script setup lang="ts">

import startBlock from './assets/blocks/start.png'
import processBlock from './assets/blocks/process.png'
import decisionBlock from './assets/blocks/decision.png'
import inputBlock from './assets/blocks/input.png'

</script>

<template>

  <div class="app">

    <!-- SIDEBAR -->
    <aside class="sidebar">
      <h2>FLOWCHART</h2>
    </aside>

    <!-- CANVAS -->
    <main class="canvas">

      <!-- SVG ЛИНИИ -->
      <svg class="svg-layer">

        <line
          x1="220"
          y1="120"
          x2="500"
          y2="120"
          stroke="white"
          stroke-width="2"
        />

        <line
          x1="220"
          y1="260"
          x2="500"
          y2="260"
          stroke="white"
          stroke-width="2"
        />

        <line
          x1="220"
          y1="400"
          x2="500"
          y2="400"
          stroke="white"
          stroke-width="2"
        />

        <line
          x1="220"
          y1="540"
          x2="500"
          y2="540"
          stroke="white"
          stroke-width="2"
        />

      </svg>

      <!-- START -->
      <img
        :src="startBlock"
        class="node"
        style="top: 60px;"
      />

      <!-- PROCESS -->
      <img
        :src="processBlock"
        class="node"
        style="top: 200px;"
      />

      <!-- DECISION -->
      <img
        :src="decisionBlock"
        class="node"
        style="top: 340px;"
      />

      <!-- INPUT -->
      <img
        :src="inputBlock"
        class="node"
        style="top: 480px;"
      />

    </main>

  </div>

</template>

<style scoped>

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.app {
  display: flex;
  width: 100vw;
  height: 100vh;
  background: #1e1e1e;
  overflow: hidden;
}

/* SIDEBAR */

.sidebar {
  width: 260px;
  background: #252526;
  border-right: 1px solid #333;
  color: white;
  padding: 20px;
}

.sidebar h2 {
  font-size: 32px;
}

/* CANVAS */

.canvas {
  position: relative;
  flex: 1;
}

/* SVG */

.svg-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

/* BLOCKS */

.node {
  position: absolute;
  left: 100px;
  width: 120px;

  user-select: none;
  cursor: pointer;
}

</style>