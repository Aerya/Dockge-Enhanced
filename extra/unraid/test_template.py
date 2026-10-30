"""Read-only contract tests for the experimental Unraid installation package."""
import copy
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent


def validate(root):
    assert root.findtext("Repository") == "ghcr.io/aerya/dockge-enhanced:test-unraid"
    assert root.findtext("Privileged") == "false"
    assert root.findtext("Network") == "bridge"
    configs = root.findall("Config")
    targets = [item.get("Target") for item in configs]
    assert len(targets) == len(set(targets))
    assert not {"PUID", "PGID"}.intersection(targets)
    data = next(item for item in configs if item.get("Target") == "/app/data")
    assert data.text == "/mnt/user/appdata/dockge-enhanced-unraid-test/data"
    assert data.get("Mode") == "rw"
    env = next(item for item in configs if item.get("Target") == "DOCKGE_STACKS_DIR")
    stack = next(item for item in configs if item.get("Type") == "Path" and item.get("Target") == env.text)
    assert stack.text == env.text == env.get("Default") == stack.get("Default")
    assert stack.text == "/mnt/user/appdata/dockge-enhanced-unraid-test/stacks"
    assert stack.get("Mode") == "rw"
    socket = next(item for item in configs if item.get("Target") == "/var/run/docker.sock")
    assert socket.text == "/var/run/docker.sock"
    assert len(configs) == 5
    port = next(item for item in configs if item.get("Type") == "Port")
    assert port.get("Target") == "5001" and port.text == "5055"
    assert "[PORT:5001]" in root.findtext("WebUI")
    icon = root.findtext("Icon").split("/test/unraid/", 1)[1]
    assert (ROOT / icon).is_file()


class TemplateTests(unittest.TestCase):
    def setUp(self):
        self.root = ET.parse(HERE / "dockge-enhanced.xml").getroot()

    def test_template(self):
        validate(self.root)

    def test_reject_production_tag(self):
        self.root.find("Repository").text = "ghcr.io/aerya/dockge-enhanced:latest"
        with self.assertRaises(AssertionError):
            validate(self.root)

    def test_reject_privileged(self):
        self.root.find("Privileged").text = "true"
        with self.assertRaises(AssertionError):
            validate(self.root)

    def test_reject_mismatched_host_path(self):
        self.root.find("Config[@Name='Dedicated test stacks']").text = "/mnt/user/other"
        with self.assertRaises(AssertionError):
            validate(self.root)

    def test_reject_production_data(self):
        self.root.find("Config[@Target='/app/data']").text = "/mnt/user/appdata/dockge/data"
        with self.assertRaises(AssertionError):
            validate(self.root)

    def test_reject_duplicate_mount(self):
        self.root.append(copy.deepcopy(self.root.find("Config[@Target='/app/data']")))
        with self.assertRaises(AssertionError):
            validate(self.root)

    def test_all_guides_link_each_other(self):
        files = ["README.md", "README.fr.md", "README.de.md", "README.es.md", "README.zh-CN.md"]
        for name in files:
            content = (HERE / name).read_text()
            for linked in files:
                self.assertIn(f"]({linked})", content)
            for required in ["dockge-enhanced.xml", "test-unraid", "PUID", "PGID", "0777", "5055", "DOCKGE_STACKS_DIR", "alex3305", "sidecar"]:
                self.assertIn(required.lower(), content.lower(), (name, required))


if __name__ == "__main__":
    unittest.main(verbosity=2)
