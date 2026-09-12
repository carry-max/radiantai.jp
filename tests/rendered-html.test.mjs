import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

test("standard Next renders every route and rejects forged Sites identity", {timeout:60000}, async () => {
  const origin = "http://127.0.0.1:3197";
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p","3197"], {
    env:{...process.env,SUPABASE_URL:"",SUPABASE_PUBLISHABLE_KEY:"",AUTH_SITE_URL:origin},stdio:["ignore","pipe","pipe"]
  });
  let logs = ""; server.stdout.on("data",c=>logs+=c); server.stderr.on("data",c=>logs+=c);
  try {
    let ready=false;
    for(let i=0;i<100;i++){
      if(server.exitCode!==null) throw new Error(logs);
      try { ready=(await fetch(origin)).ok; } catch {}
      if(ready) break; await delay(200);
    }
    assert.ok(ready,logs);
    for(const [path,content] of [["/","RADIANT REVIEW"],["/login","Googleでログイン"],["/dashboard","成長の現在地"],["/analysis","録画をドロップ"],["/pricing","プレイ量に合わせた"],["/legal","特定商取引法"],["/privacy","動画全体"]]){
      const response=await fetch(origin+path); assert.equal(response.status,200,path); assert.ok((await response.text()).includes(content),path);
    }
    const old=await fetch(origin+"/account",{redirect:"manual"});
    assert.equal(old.status,307); assert.equal(new URL(old.headers.get("location"),origin).pathname,"/login");
    const health=await fetch(origin+"/api/health");
    assert.equal(health.status,200); assert.deepEqual(await health.json(),{status:"ok"});
    const headers={"oai-authenticated-user-id":"owner","oai-authenticated-user-email":"owner@example.test"};
    assert.equal((await fetch(origin+"/auth/session",{headers})).status,503);
    assert.equal((await fetch(origin+"/api/player-growth",{method:"POST",headers,body:"{}"})).status,503);
  } finally {
    const closed=new Promise(resolve=>server.once("exit",resolve));
    if(server.exitCode===null){server.kill();await closed;}
  }
});
