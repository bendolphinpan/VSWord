<?xml version="1.0" encoding="UTF-8"?>
<!-- VSWord T-5.9 complex fixture: arrowlinks + richcontent + hooks + unknown attrs + multi-branch -->
<map version="1.0.1">
<node ID="root" TEXT="Product Roadmap" CREATED="1717900000000" MODIFIED="1717900000000">
  <hook NAME="MapStyle">
    <properties show_icon_for_attributes="true" show_note_icons="true" />
  </hook>
  <font NAME="SansSerif" SIZE="14" BOLD="true"/>
  <edge STYLE="bezier" COLOR="#666666"/>
  <node ID="phase-1" TEXT="Phase 1 · Discovery" POSITION="right" COLOR="#1f6feb">
    <arrowlink ID="al-cross-1" DESTINATION="phase-3-test" STARTARROW="None" ENDARROW="Default" COLOR="#b46ce0"/>
    <node ID="p1-research" TEXT="User Research" CUSTOM_ATTR="keep-me">
      <icon BUILTIN="idea"/>
      <node ID="p1-r-interview" TEXT="Interview 12 users"/>
      <node ID="p1-r-survey" TEXT="Quant survey n=200" FOLDED="true">
        <node ID="p1-r-s-template" TEXT="Survey template draft"/>
      </node>
    </node>
    <node ID="p1-personas" TEXT="Personas">
      <richcontent TYPE="NODE"><html><body><p>Three primary <b>personas</b> identified.</p></body></html></richcontent>
      <arrowlink ID="al-cross-2" DESTINATION="p2-mvp" ENDARROW="Default"/>
    </node>
  </node>
  <node ID="phase-2" TEXT="Phase 2 · Build" POSITION="right" FOLDED="false">
    <node ID="p2-mvp" TEXT="MVP Scope">
      <node ID="p2-mvp-feat-a" TEXT="Feature A"/>
      <node ID="p2-mvp-feat-b" TEXT="Feature B"/>
    </node>
    <node ID="p2-arch" TEXT="Architecture">
      <node ID="p2-arch-fe" TEXT="Frontend stack"/>
      <node ID="p2-arch-be" TEXT="Backend stack"/>
    </node>
  </node>
  <node ID="phase-3" TEXT="Phase 3 · Launch" POSITION="left" FOLDED="true">
    <node ID="phase-3-test" TEXT="QA &amp; Test">
      <node ID="p3-test-unit" TEXT="Unit"/>
      <node ID="p3-test-e2e" TEXT="E2E"/>
    </node>
    <node ID="phase-3-marketing" TEXT="Marketing">
      <arrowlink ID="al-marketing-to-research" DESTINATION="p1-research" ENDARROW="Default" COLOR="#10b981"/>
    </node>
  </node>
  <node ID="phase-4" TEXT="Phase 4 · Iterate" POSITION="left">
    <node ID="p4-feedback" TEXT="Feedback loop"/>
    <node ID="p4-metrics" TEXT="Metrics dashboard">
      <icon BUILTIN="full-1"/>
      <icon BUILTIN="clock"/>
    </node>
  </node>
</node>
</map>
