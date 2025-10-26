// popup.js
import {
  IS_EXT,
  $btn,
  $list,
  $serverList,
  $currentServerName,
  cacheDom,
} from "./env.js";
import {
  currentServer,
  init,
  initNotifyToggle,
  openServerList,
  refreshNow,
  setServerAndRefresh,
} from "./functions.js";

// 페이지가 확장 프로그램 팝업으로 실행되었는지 확인
if (window.location.protocol === "chrome-extension:") {
  document.body.classList.add("is-extension");
}

if ($currentServerName && $serverList) {
  $currentServerName.addEventListener("click", openServerList);
  $serverList.style.display = "none";
}

if ($btn) $btn.addEventListener("click", refreshNow);

document.addEventListener("DOMContentLoaded", function () {
  cacheDom();
  initNotifyToggle();
  const serverList = document.querySelector(".server-list");
  if (serverList) {
    serverList.querySelectorAll("div").forEach(function (div) {
      div.addEventListener("click", function () {
        if (parseInt(div.id, 10) === currentServer) {
          serverList.style.display = "none";
          return;
        }
        $list.innerHTML = "";
        setServerAndRefresh(parseInt(div.id, 10));
        if (IS_EXT) {
          chrome.storage?.local?.set({ currentServer });
        } else {
          localStorage.setItem("currentServer", currentServer);
        }
        serverList.style.display = "none";
      });
    });
  }
});

if (IS_EXT) {
  chrome.storage?.local?.get("currentServer", (st) => {
    if (st && st.currentServer) {
      setServerAndRefresh(st.currentServer);
    } else {
      setServerAndRefresh(3);
    }
  });
} else {
  const lsServer = localStorage.getItem("currentServer");
  if (lsServer) {
    setServerAndRefresh(parseInt(lsServer, 10));
  } else {
    setServerAndRefresh(3);
  }
}

init();
