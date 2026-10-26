package com.mylifeos.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import org.junit.Test;
import static org.junit.Assert.*;

/** Exercise Capacitor's actual JSON decoding, rather than a mocked JS bridge. */
public class NativeStorageBridgeTest {
    @Test public void javascriptIntegerRevisionsSurviveTheBridgeOnFirstSaveAndRetry() throws Exception {
        for (long revision : new long[] { 0, 1, 8, Integer.MAX_VALUE, 2147483648L }) {
            PluginCall call = new PluginCall(null, "NativeStorage", "test", "write",
                new JSObject("{\"expectedRevision\":" + revision + ",\"entries\":{}}"));
            assertEquals("Saving/retrying must use the actual durable revision", revision, NativeStoragePlugin.expectedRevision(call));
        }
    }

    @Test public void invalidRevisionsAreRejectedWithoutCoercion() throws Exception {
        for (String json : new String[] { "{}", "{\"expectedRevision\":null}", "{\"expectedRevision\":\"0\"}",
                "{\"expectedRevision\":-1}", "{\"expectedRevision\":0.5}", "{\"expectedRevision\":9007199254740992}" }) {
            PluginCall call = new PluginCall(null, "NativeStorage", "test", "write", new JSObject(json));
            try { NativeStoragePlugin.expectedRevision(call); fail("Invalid revision accepted: " + json); }
            catch (org.json.JSONException expected) { /* Must never silently fall back to a revision. */ }
        }
    }
}
