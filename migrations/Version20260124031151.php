<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260124031151 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE TABLE prophylaxis_task (id INT AUTO_INCREMENT NOT NULL, target_day INT NOT NULL, name VARCHAR(255) NOT NULL, type VARCHAR(50) NOT NULL, speculation_id INT NOT NULL, INDEX IDX_F31C73EC5CB73291 (speculation_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('ALTER TABLE prophylaxis_task ADD CONSTRAINT FK_F31C73EC5CB73291 FOREIGN KEY (speculation_id) REFERENCES speculation (id)');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE prophylaxis_task DROP FOREIGN KEY FK_F31C73EC5CB73291');
        $this->addSql('DROP TABLE prophylaxis_task');
    }
}
