import { createFileRoute } from "@tanstack/react-router";

import { team } from "~/mocks/data";

export const Route = createFileRoute("/team")({
  component: Team,
});

function Team() {
  return (
    <>
      <h1>Team and agents</h1>
      <button type="button" disabled>
        Invite member
      </button>{" "}
      <button type="button" disabled>
        Add agent
      </button>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Kind</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {team.map((member) => (
            <tr key={member.id}>
              <td>{member.name}</td>
              <td>{member.email}</td>
              <td>{member.kind}</td>
              <td>{member.role}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
